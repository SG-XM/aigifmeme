import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '@/core/db';
import { emailSenderAddress } from '@/core/email/configured-provider';
import { ResendProvider } from '@/core/email/resend';
import { envConfigs } from '@/config';
import { emailRecall, user } from '@/config/db/schema';
import { getAllConfigs, saveConfigs } from '@/modules/config/service';
import {
  claimRecallSend,
  findRecallCandidates,
  hasRecallPayment,
  isRecallSuppressed,
  issueRecall,
  markRecallSend,
  recallSendAllowance,
  refreshRecallForSend,
  releaseRecallSend,
  releaseRecallSendReservation,
  reserveRecallSend,
} from '@/modules/email-recall/service';
import {
  isRecallQuotaError,
  RECALL_PAUSE_CONFIG_KEY,
  recallLocale,
  recallQuotaPauseUntil,
  recallSendLimits,
  type RecallKind,
} from '@/lib/email-recall';
import { renderRecallEmail } from '@/lib/email-recall-template';
import { recallEmailKey, recallToken } from '@/lib/email-recall-token';

/** Called by Nitro's schedule or an authenticated admin; never by a public GET. */
export async function runEmailRecall() {
  const configs = await getAllConfigs(true);
  if (configs.email_recall_enabled !== 'true')
    return { status: 'disabled', sent: 0 };
  if (!configs.resend_api_key || !configs.resend_sender_email)
    throw new Error('Configure Resend before enabling recall');
  const pausedUntil = Date.parse(configs[RECALL_PAUSE_CONFIG_KEY] ?? '');
  if (Number.isFinite(pausedUntil) && pausedUntil > Date.now())
    return { status: 'paused', sent: 0 };
  const appUrl = configs.app_url || envConfigs.app_url;
  const candidates = await findRecallCandidates();
  for (const candidate of candidates.slice(0, 25)) await issueRecall(candidate);
  const limits = recallSendLimits(configs);
  const allowance = await recallSendAllowance(limits);
  if (allowance <= 0) return { status: 'capped', sent: 0 };
  const ready = await db()
    .select()
    .from(emailRecall)
    .where(
      and(eq(emailRecall.status, 'ready'), isNull(emailRecall.unsubscribedAt))
    )
    .orderBy(asc(emailRecall.attemptedAt), asc(emailRecall.createdAt))
    .limit(allowance);
  const provider = new ResendProvider({
    apiKey: configs.resend_api_key,
    defaultFrom: emailSenderAddress(
      configs.resend_sender_email,
      configs.app_name || envConfigs.app_name
    ),
  });
  let sent = 0;
  for (const original of ready) {
    const refreshed = await refreshRecallForSend(original);
    if (!refreshed) {
      await db()
        .update(emailRecall)
        .set({ status: 'skipped' })
        .where(
          and(eq(emailRecall.id, original.id), eq(emailRecall.status, 'ready'))
        );
      continue;
    }
    if ('wait' in refreshed) {
      await db()
        .update(emailRecall)
        .set({ attemptedAt: new Date() })
        .where(
          and(eq(emailRecall.id, original.id), eq(emailRecall.status, 'ready'))
        );
      continue;
    }
    const row = refreshed;
    const locale = recallLocale(row.locale);
    const prefix = locale === 'es' ? '/es' : '';
    const checkoutUrl = new URL(prefix + '/recall', appUrl);
    checkoutUrl.searchParams.set('token', recallToken(row.id, 'checkout'));
    const unsubscribeUrl = new URL(prefix + '/recall/unsubscribe', appUrl);
    const unsubscribeToken = recallToken(row.id, 'unsubscribe');
    unsubscribeUrl.searchParams.set('token', unsubscribeToken);
    const oneClick = new URL('/api/email-recall/unsubscribe', appUrl);
    oneClick.searchParams.set('token', unsubscribeToken);
    const message = renderRecallEmail({
      appName: configs.app_name || envConfigs.app_name,
      appUrl,
      logoUrl: new URL(configs.app_logo || envConfigs.app_logo, appUrl).href,
      locale,
      kind: row.kind as RecallKind,
      checkoutUrl: checkoutUrl.href,
      unsubscribeUrl: unsubscribeUrl.href,
    });
    // Reserve before the provider call so overlapping runs share one budget.
    const reserved = await reserveRecallSend(limits);
    if (!reserved) return { status: 'capped', sent };
    const claim = await claimRecallSend(row);
    if (!claim) {
      await releaseRecallSendReservation();
      continue;
    }
    // Any unknown provider result consumes the slot and requires manual review.
    // This deliberately prefers a missed reminder to a duplicate email.
    // A quota rejection is not unknown: Resend did not accept the email.
    let result;
    try {
      result = await provider.sendEmail({
        to: row.recipientEmail,
        ...message,
        ...(configs.email_recall_reply_to
          ? { replyTo: configs.email_recall_reply_to }
          : {}),
        idempotencyKey: 'email-recall-v1/' + row.id,
        headers: {
          'List-Unsubscribe': '<' + oneClick.href + '>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
    } catch {
      await markRecallSend(row.id, claim);
      continue;
    }
    if (isRecallQuotaError(result.errorName, result.error)) {
      await releaseRecallSendReservation();
      await releaseRecallSend(row.id, claim);
      await saveConfigs({
        [RECALL_PAUSE_CONFIG_KEY]: recallQuotaPauseUntil(),
      });
      return { status: 'paused', sent };
    }
    if (!result.success) {
      await releaseRecallSendReservation();
      await markRecallSend(row.id, claim);
      continue;
    }
    await markRecallSend(row.id, claim, result.messageId);
    sent++;
  }
  return { status: 'completed', sent };
}
