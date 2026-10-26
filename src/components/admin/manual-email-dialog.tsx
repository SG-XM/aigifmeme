import { useEffect, useMemo, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { Check, Loader2, Mail, RotateCcw, Send, TestTube2 } from 'lucide-react';
import { z } from 'zod';

import { envConfigs } from '@/config';
import { apiPost } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { createCreditGiftEmailTemplate } from '@/components/admin/credit-gift-email-template';
import { createCreditRedemptionEmailTemplate } from '@/components/admin/credit-redemption-email-template';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const SEND_BATCH_SIZE = 25;
type EmailBodyFormat = 'text' | 'html';
type EmailTemplateChoice = 'none' | 'credit-gift' | 'credit-redeem';
type CreditAmountChoice = '5' | '10' | '20' | '50' | 'custom';

interface SendResult {
  email: string;
  success: boolean;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRecipients: string[];
  onSent: () => void;
}

export function ManualEmailDialog({
  open,
  onOpenChange,
  initialRecipients,
  onSent,
}: Props) {
  const initialRecipientsKey = initialRecipients.join('\n');
  const [recipients, setRecipients] = useState<string[]>(initialRecipients);
  const [recipientInput, setRecipientInput] = useState('');
  const [recipientError, setRecipientError] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [bodyFormat, setBodyFormat] = useState<EmailBodyFormat>('text');
  const [emailTemplate, setEmailTemplate] =
    useState<EmailTemplateChoice>('none');
  const [creditAmountChoice, setCreditAmountChoice] =
    useState<CreditAmountChoice>('5');
  const [customCreditAmount, setCustomCreditAmount] = useState('5');
  const [templateError, setTemplateError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [confirmation, setConfirmation] = useState<'send' | 'retry' | null>(
    null
  );
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);
  const [results, setResults] = useState<Record<string, SendResult>>({});
  const [testStatus, setTestStatus] = useState<'success' | 'error' | null>(
    null
  );

  const messageSchema = useMemo(
    () =>
      z.object({
        subject: z
          .string()
          .trim()
          .min(1, m['admin.users.email_subject_required']())
          .max(200, m['admin.users.email_subject_too_long']()),
        text: z
          .string()
          .trim()
          .min(1, m['admin.users.email_body_required']())
          .max(20_000, m['admin.users.email_body_too_long']()),
      }),
    []
  );

  const form = useForm({
    defaultValues: { subject: '', text: '' },
    validators: { onSubmit: messageSchema },
    onSubmit: async () => {
      setConfirmation('send');
    },
  });

  const testMutation = useMutation({
    mutationFn: (values: {
      email: string;
      subject: string;
      content: string;
      format: EmailBodyFormat;
      redemptionCredits?: number;
    }) =>
      apiPost<{ success: boolean }>('/api/admin/email-campaign', {
        action: 'test',
        ...values,
      }),
    onSuccess: () => setTestStatus('success'),
    onError: () => setTestStatus('error'),
  });

  const sendMutation = useMutation({
    mutationFn: (values: {
      recipients: string[];
      subject: string;
      content: string;
      format: EmailBodyFormat;
      redemptionCredits?: number;
    }) =>
      apiPost<{ results: SendResult[] }>('/api/admin/email-campaign', {
        action: 'send',
        ...values,
      }),
  });

  useEffect(() => {
    if (!open) return;
    form.reset();
    setRecipients(
      initialRecipientsKey
        ? initialRecipientsKey.split('\n').filter(Boolean)
        : []
    );
    setRecipientInput('');
    setRecipientError('');
    setTestEmail('');
    setBodyFormat('text');
    setEmailTemplate('none');
    setCreditAmountChoice('5');
    setCustomCreditAmount('5');
    setTemplateError('');
    setShowPreview(false);
    setConfirmation(null);
    setIsSending(false);
    setProgress(null);
    setResults({});
    setTestStatus(null);
    testMutation.reset();
    sendMutation.reset();
    // The serialized recipient list keeps this effect stable when the parent rerenders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialRecipientsKey]);

  const busy = isSending || testMutation.isPending;
  const failedEmails = useMemo(
    () =>
      Object.values(results)
        .filter((result) => !result.success)
        .map((result) => result.email),
    [results]
  );
  const successfulCount = Object.values(results).filter(
    (result) => result.success
  ).length;
  const confirmationRecipients =
    confirmation === 'retry' ? failedEmails : recipients;

  function handleOpenChange(nextOpen: boolean) {
    if (busy || resolveMutation.isPending) return;
    onOpenChange(nextOpen);
  }

  const resolveMutation = useMutation({
    mutationFn: (input: { pastedEmails: string; baseRecipients: string[] }) =>
      apiPost<{ recipients: string[] }>('/api/admin/email-campaign', {
        action: 'resolve',
        pastedEmails: [...input.baseRecipients, input.pastedEmails].join('\n'),
      }),
    onSuccess: ({ recipients: resolved }) => {
      setRecipients(resolved);
      setRecipientInput('');
      setRecipientError('');
      setResults({});
    },
    onError: (error: Error) => setRecipientError(error.message),
  });

  function addPastedRecipients() {
    const pasted = recipientInput
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (pasted.length === 0) {
      setRecipientError(m['admin.users.email_paste_required']());
      return;
    }
    const invalid = pasted.filter(
      (email) => email.length > 320 || !EMAIL_PATTERN.test(email)
    );
    if (invalid.length > 0) {
      setRecipientError(
        m['admin.users.email_invalid_addresses']({
          emails: invalid.slice(0, 5).join(', '),
        })
      );
      return;
    }

    resolveMutation.mutate({
      pastedEmails: recipientInput,
      baseRecipients: recipients,
    });
  }

  function handleTestSend() {
    const values = messageSchema.safeParse(form.state.values);
    if (!values.success) {
      setRecipientError(values.error.issues[0]?.message || '');
      return;
    }
    const email = testEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      setTestStatus('error');
      return;
    }
    setTestStatus(null);
    testMutation.mutate({
      email,
      subject: values.data.subject,
      content: values.data.text,
      format: bodyFormat,
      ...(emailTemplate === 'credit-redeem'
        ? {
            redemptionCredits: Number(
              creditAmountChoice === 'custom'
                ? customCreditAmount
                : creditAmountChoice
            ),
          }
        : {}),
    });
  }

  function applySelectedTemplate() {
    const amount = Number(
      creditAmountChoice === 'custom' ? customCreditAmount : creditAmountChoice
    );
    if (!Number.isSafeInteger(amount) || amount < 1) {
      setTemplateError(m['admin.users.email_template_amount_invalid']());
      return;
    }

    const template =
      emailTemplate === 'credit-redeem'
        ? createCreditRedemptionEmailTemplate(
            amount,
            envConfigs.app_name,
            envConfigs.app_url
          )
        : createCreditGiftEmailTemplate(
            amount,
            envConfigs.app_name,
            envConfigs.app_url
          );
    form.setFieldValue('subject', template.subject);
    form.setFieldValue('text', template.html);
    setTemplateError('');
    setBodyFormat('html');
  }

  async function sendAddresses(addresses: string[], retry: boolean) {
    if (addresses.length === 0) return;
    const nextResults: Record<string, SendResult> = retry ? { ...results } : {};
    setResults(nextResults);
    setConfirmation(null);
    setIsSending(true);
    setProgress({ processed: 0, total: addresses.length });

    for (let offset = 0; offset < addresses.length; offset += SEND_BATCH_SIZE) {
      const batch = addresses.slice(offset, offset + SEND_BATCH_SIZE);
      try {
        const response = await sendMutation.mutateAsync({
          recipients: batch,
          subject: form.state.values.subject.trim(),
          content: form.state.values.text,
          format: bodyFormat,
          ...(emailTemplate === 'credit-redeem'
            ? {
                redemptionCredits: Number(
                  creditAmountChoice === 'custom'
                    ? customCreditAmount
                    : creditAmountChoice
                ),
              }
            : {}),
        });
        for (const result of response.results)
          nextResults[result.email] = result;
      } catch {
        for (const email of batch) {
          nextResults[email] = {
            email,
            success: false,
            error: m['admin.users.email_batch_failed'](),
          };
        }
      }
      setResults({ ...nextResults });
      setProgress({
        processed: Math.min(offset + batch.length, addresses.length),
        total: addresses.length,
      });
    }

    setIsSending(false);
    if (!retry && addresses.every((email) => nextResults[email]?.success)) {
      onSent();
    }
  }

  function confirmSend() {
    const target = confirmationRecipients;
    void sendAddresses(target, confirmation === 'retry');
  }

  const hasResults = Object.keys(results).length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m['admin.users.email_dialog_title']()}</DialogTitle>
          <DialogDescription>
            {m['admin.users.email_dialog_description']()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="manual-email-recipients">
              {m['admin.users.email_recipients_label']()}
            </Label>
            <Textarea
              id="manual-email-recipients"
              value={recipientInput}
              onChange={(event) => {
                setRecipientInput(event.target.value);
                setRecipientError('');
              }}
              rows={3}
              placeholder={m['admin.users.email_recipients_placeholder']()}
              disabled={busy || resolveMutation.isPending}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs">
                {m['admin.users.email_recipients_count']({
                  count: recipients.length,
                })}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addPastedRecipients}
                disabled={
                  busy || resolveMutation.isPending || !recipientInput.trim()
                }
              >
                {resolveMutation.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {m['admin.users.email_add_recipients']()}
              </Button>
            </div>
            {recipientError && (
              <p className="text-destructive text-sm">{recipientError}</p>
            )}
            {recipients.length > 0 && (
              <div className="bg-muted/50 max-h-24 overflow-y-auto rounded-md border p-2 text-xs">
                {recipients.slice(0, 25).map((email) => (
                  <div key={email} className="truncate py-0.5">
                    {email}
                  </div>
                ))}
                {recipients.length > 25 && (
                  <div className="text-muted-foreground pt-1">
                    {m['admin.users.email_more_recipients']({
                      count: recipients.length - 25,
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {!showPreview ? (
            <form
              className="min-w-0 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                form.handleSubmit();
              }}
            >
              <form.Field name="subject">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>
                      {m['admin.users.email_subject_label']()}
                    </Label>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onBlur={field.handleBlur}
                      maxLength={200}
                      disabled={busy}
                    />
                    {field.state.meta.errors[0] && (
                      <p className="text-destructive text-sm">
                        {String(field.state.meta.errors[0])}
                      </p>
                    )}
                  </div>
                )}
              </form.Field>
              <div className="space-y-2">
                <Label id="manual-email-template-label">
                  {m['admin.users.email_template_label']()}
                </Label>
                <Select
                  value={emailTemplate}
                  onValueChange={(value) => {
                    if (
                      value === 'none' ||
                      value === 'credit-gift' ||
                      value === 'credit-redeem'
                    ) {
                      setEmailTemplate(value);
                      setTemplateError('');
                    }
                  }}
                  disabled={busy}
                >
                  <SelectTrigger
                    className="w-full"
                    aria-labelledby="manual-email-template-label"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {m['admin.users.email_template_none']()}
                    </SelectItem>
                    <SelectItem value="credit-gift">
                      {m['admin.users.email_template_credit_gift']()}
                    </SelectItem>
                    <SelectItem value="credit-redeem">
                      {m['admin.users.email_template_credit_redeem']()}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(emailTemplate === 'credit-gift' ||
                emailTemplate === 'credit-redeem') && (
                <div className="space-y-2">
                  <Label id="manual-email-credit-amount-label">
                    {m['admin.users.email_template_amount']()}
                  </Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={creditAmountChoice}
                      onValueChange={(value) => {
                        if (
                          value === '5' ||
                          value === '10' ||
                          value === '20' ||
                          value === '50' ||
                          value === 'custom'
                        ) {
                          setCreditAmountChoice(value);
                          setTemplateError('');
                        }
                      }}
                      disabled={busy}
                    >
                      <SelectTrigger
                        className="w-32"
                        aria-labelledby="manual-email-credit-amount-label"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="custom">
                          {m['admin.users.email_template_custom']()}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {creditAmountChoice === 'custom' && (
                      <Input
                        id="manual-email-credit-amount"
                        className="w-36"
                        type="number"
                        min="1"
                        step="1"
                        aria-labelledby="manual-email-credit-amount-label"
                        value={customCreditAmount}
                        onChange={(event) => {
                          setCustomCreditAmount(event.target.value);
                          setTemplateError('');
                        }}
                        disabled={busy}
                      />
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={applySelectedTemplate}
                      disabled={busy}
                    >
                      {m['admin.users.email_template_apply']()}
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {m['admin.users.email_template_overwrite_hint']()}
                  </p>
                  {templateError && (
                    <p className="text-destructive text-sm">{templateError}</p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label>{m['admin.users.email_format_label']()}</Label>
                <div className="flex flex-wrap gap-2" role="group">
                  <Button
                    type="button"
                    size="sm"
                    variant={bodyFormat === 'text' ? 'default' : 'outline'}
                    aria-pressed={bodyFormat === 'text'}
                    onClick={() => setBodyFormat('text')}
                    disabled={busy}
                  >
                    {m['admin.users.email_format_text']()}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={bodyFormat === 'html' ? 'default' : 'outline'}
                    aria-pressed={bodyFormat === 'html'}
                    onClick={() => setBodyFormat('html')}
                    disabled={busy}
                  >
                    {m['admin.users.email_format_html']()}
                  </Button>
                </div>
                {bodyFormat === 'html' && (
                  <p className="text-muted-foreground text-xs">
                    {m['admin.users.email_html_hint']()}
                  </p>
                )}
              </div>
              <form.Field name="text">
                {(field) => (
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor={field.name}>
                      {bodyFormat === 'html'
                        ? m['admin.users.email_body_html_label']()
                        : m['admin.users.email_body_label']()}
                    </Label>
                    <Textarea
                      id={field.name}
                      className="field-sizing-fixed w-full max-w-full min-w-0 break-all whitespace-pre-wrap"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onBlur={field.handleBlur}
                      rows={8}
                      maxLength={20_000}
                      disabled={busy}
                    />
                    <div className="flex justify-between gap-2">
                      {field.state.meta.errors[0] ? (
                        <p className="text-destructive text-sm">
                          {String(field.state.meta.errors[0])}
                        </p>
                      ) : (
                        <span />
                      )}
                      <span className="text-muted-foreground text-xs">
                        {field.state.value.length}/20000
                      </span>
                    </div>
                  </div>
                )}
              </form.Field>
              <Button type="submit" className="hidden" />
            </form>
          ) : (
            <div className="bg-muted/50 space-y-3 rounded-md border p-4">
              <div>
                <p className="text-muted-foreground text-xs">
                  {m['admin.users.email_subject_label']()}
                </p>
                <p className="font-medium">
                  {form.state.values.subject || '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">
                  {bodyFormat === 'html'
                    ? m['admin.users.email_body_html_label']()
                    : m['admin.users.email_body_label']()}
                </p>
                {bodyFormat === 'html' ? (
                  <iframe
                    title={m['admin.users.email_html_preview_title']()}
                    srcDoc={
                      form.state.values.text ||
                      '<!doctype html><html><body></body></html>'
                    }
                    sandbox=""
                    referrerPolicy="no-referrer"
                    className="bg-background mt-2 h-80 w-full rounded-md border"
                  />
                ) : (
                  <p className="break-words whitespace-pre-wrap">
                    {form.state.values.text || '—'}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <div className="min-w-56 flex-1 space-y-2">
              <Label htmlFor="manual-email-test-address">
                {m['admin.users.email_test_address_label']()}
              </Label>
              <Input
                id="manual-email-test-address"
                type="email"
                value={testEmail}
                onChange={(event) => {
                  setTestEmail(event.target.value);
                  setTestStatus(null);
                }}
                placeholder="you@example.com"
                disabled={busy}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleTestSend}
              disabled={busy}
            >
              {testMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <TestTube2 className="size-4" />
              )}
              {m['admin.users.email_send_test']()}
            </Button>
          </div>

          {testStatus && (
            <p
              className={
                testStatus === 'success'
                  ? 'text-sm text-emerald-600'
                  : 'text-destructive text-sm'
              }
            >
              {testStatus === 'success'
                ? m['admin.users.email_test_sent']()
                : m['admin.users.email_test_failed']()}
            </p>
          )}

          {isSending && progress && (
            <div className="bg-muted rounded-md p-3 text-sm">
              <div className="mb-2 flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                {m['admin.users.email_progress'](progress)}
              </div>
              <div className="bg-background h-2 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full transition-all"
                  style={{
                    width: `${Math.round((progress.processed / progress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {hasResults && !isSending && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Check className="size-4 text-emerald-600" />
                {m['admin.users.email_results_summary']({
                  sent: successfulCount,
                  failed: failedEmails.length,
                })}
              </div>
              {failedEmails.length > 0 && (
                <div className="max-h-28 overflow-y-auto text-sm">
                  {failedEmails.map((email) => (
                    <p key={email} className="text-destructive truncate py-0.5">
                      {email}: {results[email]?.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {confirmation && (
            <div className="border-primary/30 bg-primary/5 space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">
                {confirmation === 'retry'
                  ? m['admin.users.email_confirm_retry']({
                      count: confirmationRecipients.length,
                    })
                  : m['admin.users.email_confirm_send']({
                      count: confirmationRecipients.length,
                    })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={confirmSend} disabled={busy}>
                  <Send className="size-4" />
                  {m['admin.users.email_confirm_button']()}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmation(null)}
                  disabled={busy}
                >
                  {m['admin.users.email_cancel']()}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowPreview((value) => !value)}
            disabled={busy}
          >
            <Mail className="size-4" />
            {showPreview
              ? m['admin.users.email_edit']()
              : m['admin.users.email_preview']()}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={busy || resolveMutation.isPending}
            >
              {m['admin.users.email_cancel']()}
            </Button>
            {hasResults && failedEmails.length > 0 && !isSending && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmation('retry')}
                disabled={busy}
              >
                <RotateCcw className="size-4" />
                {m['admin.users.email_retry_failed']({
                  count: failedEmails.length,
                })}
              </Button>
            )}
            <Button
              type="button"
              onClick={() => {
                form.handleSubmit();
              }}
              disabled={
                busy || resolveMutation.isPending || recipients.length === 0
              }
            >
              <Send className="size-4" />
              {m['admin.users.email_send']({ count: recipients.length })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
