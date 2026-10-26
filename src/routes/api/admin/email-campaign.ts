import { createFileRoute } from '@tanstack/react-router';
import { inArray, like, or } from 'drizzle-orm';

import { getAuth } from '@/core/auth';
import { db } from '@/core/db';
import { createEmailProviderFromConfig } from '@/core/email/configured-provider';
import { user } from '@/config/db/schema';
import { getAllConfigs } from '@/modules/config/service';
import {
  finishCodeSend,
  releaseCodeReservation,
  reserveCodeForEmail,
} from '@/modules/credit-redeem-codes/service';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

const MAX_RECIPIENTS = 5000;
const MAX_SEND_BATCH = 25;
const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 20_000;
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

async function readJsonBody(
  request: Request
): Promise<
  { kind: 'ok'; value: unknown } | { kind: 'invalid' } | { kind: 'too-large' }
> {
  const reader = request.body?.getReader();
  if (!reader) return { kind: 'invalid' };

  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return { kind: 'too-large' };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { kind: 'ok', value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { kind: 'invalid' };
  }
}

function parseEmailList(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function validEmail(email: string): boolean {
  return email.length <= 320 && EMAIL_PATTERN.test(email);
}

function uniqueEmails(emails: string[]): string[] {
  return [...new Set(emails.map((email) => email.trim().toLowerCase()))];
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const escaped: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return escaped[character];
  });
}

function personalizeRedemptionMessage(
  value: string,
  email: string,
  code: string,
  format: 'text' | 'html'
) {
  return value
    .replaceAll('{{emailQuery}}', encodeURIComponent(email))
    .replaceAll('{{email}}', format === 'html' ? escapeHtml(email) : email)
    .replaceAll('{{code}}', code);
}

function getSafeErrorDetails(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: message
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]')
      .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/\bre_[A-Za-z0-9_-]+\b/g, '[redacted-api-key]')
      .replace(/\b[A-F0-9]{36}\b/gi, '[redacted-code]')
      .replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
        '[redacted-id]'
      )
      .slice(0, 300),
  };
}

function validateMessage(
  subjectValue: unknown,
  bodyValue: unknown,
  formatValue: unknown
) {
  if (typeof subjectValue !== 'string' || typeof bodyValue !== 'string') {
    return null;
  }
  if (
    formatValue !== undefined &&
    formatValue !== 'text' &&
    formatValue !== 'html'
  ) {
    return null;
  }

  const subject = subjectValue.replace(/[\r\n]+/g, ' ').trim();
  const content = bodyValue;
  const format = formatValue === 'html' ? 'html' : 'text';
  if (!subject || subject.length > MAX_SUBJECT_LENGTH) return null;
  if (!content.trim() || content.length > MAX_BODY_LENGTH) return null;
  return { subject, content, format };
}

async function getAdmin(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return { error: respErr('Unauthorized') };

  const allowed = await hasPermission(session.user.id, 'admin.*');
  if (!allowed) return { error: respErr('Forbidden') };
  return { userId: session.user.id };
}

async function handlePOST({ request }: { request: Request }) {
  const admin = await getAdmin(request);
  if ('error' in admin) return admin.error;

  const parsedBody = await readJsonBody(request);
  if (parsedBody.kind === 'too-large') {
    return respErr('Request body is too large');
  }
  if (
    parsedBody.kind !== 'ok' ||
    !parsedBody.value ||
    typeof parsedBody.value !== 'object'
  ) {
    return respErr('Invalid request body');
  }

  const body = parsedBody.value as Record<string, unknown>;
  const action = body.action;
  if (action !== 'resolve' && action !== 'test' && action !== 'send') {
    return respErr('Unknown email campaign action');
  }

  if (action === 'resolve') {
    const allMatching = body.allMatching === true;
    const rawUserIds = Array.isArray(body.userIds) ? body.userIds : [];
    const userIds = [
      ...new Set(
        rawUserIds.filter(
          (id): id is string => typeof id === 'string' && id.length > 0
        )
      ),
    ];

    if (allMatching && userIds.length > 0) {
      return respErr('Choose selected users or all matching users');
    }
    const excludedUserIds = Array.isArray(body.excludedUserIds)
      ? new Set(
          body.excludedUserIds.filter(
            (id): id is string => typeof id === 'string' && id.length > 0
          )
        )
      : new Set<string>();
    if (!allMatching && excludedUserIds.size > 0) {
      return respErr(
        'Excluded users are only valid when selecting all matches'
      );
    }
    if (userIds.length > MAX_RECIPIENTS) {
      return respErr(
        `A campaign can include at most ${MAX_RECIPIENTS} recipients`
      );
    }

    let accountEmails: string[] = [];
    if (allMatching) {
      const search =
        typeof body.search === 'string' ? body.search.trim().slice(0, 100) : '';
      const condition = search
        ? or(like(user.email, `%${search}%`), like(user.name, `%${search}%`))
        : undefined;
      const rows = await db()
        .select({ id: user.id, email: user.email })
        .from(user)
        .where(condition)
        .limit(MAX_RECIPIENTS + 1);
      if (rows.length > MAX_RECIPIENTS) {
        return respErr(
          `A campaign can include at most ${MAX_RECIPIENTS} recipients`
        );
      }
      accountEmails = rows
        .filter((row) => !excludedUserIds.has(row.id))
        .map((row) => row.email);
    } else if (userIds.length > 0) {
      const rows = await db()
        .select({ id: user.id, email: user.email })
        .from(user)
        .where(inArray(user.id, userIds));
      if (rows.length !== userIds.length) {
        return respErr('Some selected users are no longer available');
      }
      accountEmails = rows.map((row) => row.email);
    }

    const pastedEmails = parseEmailList(body.pastedEmails);
    if (pastedEmails.length > MAX_RECIPIENTS) {
      return respErr(
        `A campaign can include at most ${MAX_RECIPIENTS} recipients`
      );
    }
    const invalidEmail = pastedEmails.find((email) => !validEmail(email));
    if (invalidEmail) return respErr(`Invalid email address: ${invalidEmail}`);

    const recipients = uniqueEmails([...accountEmails, ...pastedEmails]);
    if (recipients.length === 0) return respErr('Add at least one recipient');
    if (recipients.length > MAX_RECIPIENTS) {
      return respErr(
        `A campaign can include at most ${MAX_RECIPIENTS} recipients`
      );
    }
    if (recipients.some((email) => !validEmail(email))) {
      return respErr('A selected account has an invalid email address');
    }

    const configured = createEmailProviderFromConfig(await getAllConfigs());
    if (!configured)
      return respErr('Configure an email provider in admin settings first');
    return respData({ recipients });
  }

  const message = validateMessage(
    body.subject,
    body.content ?? body.text,
    body.format
  );
  if (!message) {
    return respErr(
      `Subject must be 1-${MAX_SUBJECT_LENGTH} characters and body 1-${MAX_BODY_LENGTH} characters`
    );
  }

  const rawRedemptionCredits = body.redemptionCredits;
  const redemptionCredits =
    rawRedemptionCredits === undefined || rawRedemptionCredits === null
      ? null
      : Number(rawRedemptionCredits);
  if (
    redemptionCredits !== null &&
    (!Number.isSafeInteger(redemptionCredits) || redemptionCredits < 1)
  ) {
    return respErr('Invalid redemption credit amount');
  }
  if (
    redemptionCredits !== null &&
    (!message.content.includes('{{code}}') ||
      !message.content.includes('{{emailQuery}}'))
  ) {
    return respErr(
      'The redemption email body must include {{code}} and {{emailQuery}} placeholders'
    );
  }

  const configured = createEmailProviderFromConfig(await getAllConfigs());
  if (!configured)
    return respErr('Configure an email provider in admin settings first');

  if (action === 'test') {
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!validEmail(email)) return respErr('Enter a valid test email address');

    const result = await configured.provider.sendEmail({
      to: email,
      subject: redemptionCredits
        ? personalizeRedemptionMessage(
            message.subject,
            email,
            'TEST-CODE',
            message.format
          )
        : message.subject,
      ...(message.format === 'html'
        ? {
            html: redemptionCredits
              ? personalizeRedemptionMessage(
                  message.content,
                  email,
                  'TEST-CODE',
                  message.format
                )
              : message.content,
          }
        : {
            text: redemptionCredits
              ? personalizeRedemptionMessage(
                  message.content,
                  email,
                  'TEST-CODE',
                  message.format
                )
              : message.content,
          }),
    });
    if (!result.success) return respErr('Test email could not be sent');
    return respData({ success: true });
  }

  if (action === 'send') {
    const rawRecipients = Array.isArray(body.recipients)
      ? body.recipients.filter(
          (email): email is string => typeof email === 'string'
        )
      : [];
    const recipients = uniqueEmails(rawRecipients);
    if (recipients.length === 0 || recipients.length > MAX_SEND_BATCH) {
      return respErr(
        `Each send request must include 1-${MAX_SEND_BATCH} recipients`
      );
    }
    const invalidEmail = recipients.find((email) => !validEmail(email));
    if (invalidEmail) return respErr(`Invalid email address: ${invalidEmail}`);

    const results: Array<{
      email: string;
      success: boolean;
      error?: string;
    }> = new Array(recipients.length);
    let nextIndex = 0;
    const workerCount = Math.min(5, recipients.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < recipients.length) {
          const index = nextIndex++;
          const email = recipients[index];
          let reservation: Awaited<ReturnType<typeof reserveCodeForEmail>> =
            null;
          let stage = 'reserve-code';
          try {
            if (redemptionCredits !== null) {
              reservation = await reserveCodeForEmail({
                credits: redemptionCredits,
                email,
              });
              if (!reservation) {
                results[index] = {
                  email,
                  success: false,
                  error:
                    'No available, unexpired redemption code for this credit amount',
                };
                continue;
              }
            }

            stage = 'prepare-message';
            const subject = reservation
              ? personalizeRedemptionMessage(
                  message.subject,
                  email,
                  reservation.code,
                  message.format
                )
              : message.subject;
            const content = reservation
              ? personalizeRedemptionMessage(
                  message.content,
                  email,
                  reservation.code,
                  message.format
                )
              : message.content;
            stage = 'send-provider';
            const result = await configured.provider.sendEmail({
              to: email,
              subject,
              ...(message.format === 'html'
                ? { html: content }
                : { text: content }),
            });
            if (!result.success) {
              console.error('[email-campaign] provider rejected message', {
                provider: result.provider || 'unknown',
                error: getSafeErrorDetails(
                  result.error || 'Unknown provider error'
                ),
              });
            }
            if (result.success && reservation) {
              stage = 'mark-code-sent';
              const markedSent = await finishCodeSend({
                id: reservation.id,
                reservationId: reservation.reservationId,
                email,
              });
              results[index] = markedSent
                ? { email, success: true }
                : {
                    email,
                    success: false,
                    error:
                      'Email sent, but its code was invalidated during delivery',
                  };
            } else if (!result.success && reservation) {
              await releaseCodeReservation(
                reservation.id,
                reservation.reservationId
              );
              results[index] = {
                email,
                success: false,
                error: 'Provider rejected this email',
              };
            } else {
              results[index] = result.success
                ? { email, success: true }
                : {
                    email,
                    success: false,
                    error: 'Provider rejected this email',
                  };
            }
          } catch (error) {
            console.error('[email-campaign] recipient send failed', {
              stage,
              error: getSafeErrorDetails(error),
            });
            if (reservation) {
              await releaseCodeReservation(
                reservation.id,
                reservation.reservationId
              ).catch(() => {});
            }
            results[index] = {
              email,
              success: false,
              error: 'Email provider request failed',
            };
          }
        }
      })
    );

    return respData({ results });
  }

  return respErr('Unknown email campaign action');
}

async function POST(args: { request: Request }) {
  try {
    return await handlePOST(args);
  } catch {
    return respErr('Email campaign request failed');
  }
}

export const Route = createFileRoute('/api/admin/email-campaign')({
  server: {
    handlers: { POST },
  },
});
