import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runEmailRecall } from './email-recall-runner';

const state = vi.hoisted(() => ({
  configs: {} as Record<string, string>,
  ready: [] as Array<Record<string, unknown>>,
  sendEmail: vi.fn(),
  findRecallCandidates: vi.fn(async () => []),
  issueRecall: vi.fn(async () => undefined),
  markRecallSend: vi.fn(async () => undefined),
  releaseRecallSend: vi.fn(async () => undefined),
  releaseRecallSendReservation: vi.fn(async () => undefined),
  reserveRecallSend: vi.fn(async () => true),
  recallSendAllowance: vi.fn(async () => 25),
  claimRecallSend: vi.fn(async () => 'claim-1'),
  saveConfigs: vi.fn(async () => undefined),
}));

vi.mock('@/config', () => ({
  envConfigs: {
    app_url: 'https://app.test',
    app_name: 'App',
    app_logo: '/logo.png',
  },
}));
vi.mock('@/core/db', () => ({
  db: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => state.ready,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('@/modules/config/service', () => ({
  getAllConfigs: async () => state.configs,
  saveConfigs: (...args: unknown[]) => state.saveConfigs(...args),
}));
vi.mock('@/modules/email-recall/service', () => ({
  claimRecallSend: (...args: unknown[]) => state.claimRecallSend(...args),
  findRecallCandidates: (...args: unknown[]) =>
    state.findRecallCandidates(...args),
  issueRecall: (...args: unknown[]) => state.issueRecall(...args),
  markRecallSend: (...args: unknown[]) => state.markRecallSend(...args),
  recallSendAllowance: (...args: unknown[]) =>
    state.recallSendAllowance(...args),
  releaseRecallSend: (...args: unknown[]) => state.releaseRecallSend(...args),
  releaseRecallSendReservation: (...args: unknown[]) =>
    state.releaseRecallSendReservation(...args),
  reserveRecallSend: (...args: unknown[]) => state.reserveRecallSend(...args),
  refreshRecallForSend: async (row: Record<string, unknown>) => row,
}));
vi.mock('@/core/email/resend', () => ({
  ResendProvider: class {
    sendEmail = (...args: unknown[]) => state.sendEmail(...args);
  },
}));
vi.mock('@/lib/email-recall-template', () => ({
  renderRecallEmail: () => ({
    subject: 'Subject',
    html: '<p>Hi</p>',
    text: 'Hi',
  }),
}));
vi.mock('@/lib/email-recall-token', () => ({
  recallToken: () => 'token',
}));

const readyRow = {
  id: 'recall-1',
  locale: 'en',
  kind: 'checkout',
  recipientEmail: 'one@example.test',
};

describe('runEmailRecall reply-to', () => {
  beforeEach(() => {
    state.configs = {
      email_recall_enabled: 'true',
      resend_api_key: 're_test',
      resend_sender_email: 'hello@example.test',
      app_url: 'https://app.test',
      app_name: 'App',
      app_logo: '/logo.png',
    };
    state.ready = [];
    state.sendEmail.mockReset();
    state.sendEmail.mockResolvedValue({ success: true, messageId: 'm1' });
    state.findRecallCandidates.mockClear();
    state.issueRecall.mockClear();
    state.markRecallSend.mockClear();
    state.releaseRecallSend.mockClear();
    state.releaseRecallSendReservation.mockClear();
    state.reserveRecallSend.mockReset();
    state.reserveRecallSend.mockResolvedValue(true);
    state.recallSendAllowance.mockReset();
    state.recallSendAllowance.mockResolvedValue(25);
    state.claimRecallSend.mockReset();
    state.claimRecallSend.mockResolvedValue('claim-1');
    state.saveConfigs.mockClear();
  });

  it('stays off when the recall switch is disabled', async () => {
    state.configs.email_recall_enabled = 'false';
    await expect(runEmailRecall()).resolves.toEqual({
      status: 'disabled',
      sent: 0,
    });
    expect(state.sendEmail).not.toHaveBeenCalled();
  });

  it('still requires the Resend API key and sender', async () => {
    state.configs.resend_api_key = '';
    await expect(runEmailRecall()).rejects.toThrow(
      'Configure Resend before enabling recall'
    );
    state.configs.resend_api_key = 're_test';
    state.configs.resend_sender_email = '';
    await expect(runEmailRecall()).rejects.toThrow(
      'Configure Resend before enabling recall'
    );
    expect(state.sendEmail).not.toHaveBeenCalled();
  });

  it('sends without replyTo when reply-to is empty', async () => {
    state.ready = [readyRow];
    await expect(runEmailRecall()).resolves.toEqual({
      status: 'completed',
      sent: 1,
    });
    expect(state.sendEmail).toHaveBeenCalledOnce();
    expect(state.sendEmail.mock.calls[0][0]).not.toHaveProperty('replyTo');
  });

  it('passes replyTo when it is configured', async () => {
    state.configs.email_recall_reply_to = 'inbox@example.test';
    state.ready = [readyRow];
    await runEmailRecall();
    expect(state.sendEmail.mock.calls[0][0].replyTo).toBe('inbox@example.test');
  });

  it('stops the run on a Resend quota error and retries that row the next day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T18:00:00.000Z'));
    try {
      state.ready = [readyRow, { ...readyRow, id: 'recall-2' }];
      state.sendEmail.mockResolvedValue({
        success: false,
        error: 'You have exceeded your daily email sending quota.',
        errorName: 'daily_quota_exceeded',
        provider: 'resend',
      });
      await expect(runEmailRecall()).resolves.toEqual({
        status: 'paused',
        sent: 0,
      });
      expect(state.sendEmail).toHaveBeenCalledOnce();
      expect(state.releaseRecallSend).toHaveBeenCalledWith(
        'recall-1',
        'claim-1'
      );
      expect(state.releaseRecallSendReservation).toHaveBeenCalledOnce();
      expect(state.markRecallSend).not.toHaveBeenCalled();
      expect(state.saveConfigs).toHaveBeenCalledWith({
        email_recall_paused_until: '2026-10-17T00:00:00.000Z',
      });

      state.configs.email_recall_paused_until = '2026-10-17T00:00:00.000Z';
      state.findRecallCandidates.mockClear();
      state.sendEmail.mockClear();
      await expect(runEmailRecall()).resolves.toEqual({
        status: 'paused',
        sent: 0,
      });
      expect(state.findRecallCandidates).not.toHaveBeenCalled();
      expect(state.sendEmail).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('still consumes a non-quota failure and keeps sending', async () => {
    state.ready = [readyRow, { ...readyRow, id: 'recall-2' }];
    state.sendEmail
      .mockResolvedValueOnce({
        success: false,
        error: 'Too many requests.',
        errorName: 'rate_limit_exceeded',
        provider: 'resend',
      })
      .mockResolvedValueOnce({
        success: true,
        messageId: 'm2',
        provider: 'resend',
      });
    await expect(runEmailRecall()).resolves.toEqual({
      status: 'completed',
      sent: 1,
    });
    expect(state.markRecallSend).toHaveBeenCalledTimes(2);
    expect(state.releaseRecallSend).not.toHaveBeenCalled();
    expect(state.releaseRecallSendReservation).toHaveBeenCalledOnce();
    expect(state.saveConfigs).not.toHaveBeenCalled();
  });

  it('passes the configured UTC caps, defaulting to 80 a day and 2500 a month', async () => {
    await runEmailRecall();
    expect(state.recallSendAllowance).toHaveBeenCalledWith({
      daily: 80,
      monthly: 2500,
    });
    state.recallSendAllowance.mockClear();
    state.configs.email_recall_daily_limit = '12';
    state.configs.email_recall_monthly_limit = '400';
    await runEmailRecall();
    expect(state.recallSendAllowance).toHaveBeenCalledWith({
      daily: 12,
      monthly: 400,
    });
    state.recallSendAllowance.mockClear();
    state.configs.email_recall_daily_limit = '80abc';
    state.configs.email_recall_monthly_limit = '';
    await runEmailRecall();
    expect(state.recallSendAllowance).toHaveBeenCalledWith({
      daily: 80,
      monthly: 2500,
    });
  });

  it('does not call Resend when the UTC budget is already spent', async () => {
    state.ready = [readyRow];
    state.recallSendAllowance.mockResolvedValue(0);
    await expect(runEmailRecall()).resolves.toEqual({
      status: 'capped',
      sent: 0,
    });
    expect(state.reserveRecallSend).not.toHaveBeenCalled();
    expect(state.sendEmail).not.toHaveBeenCalled();
  });

  it('stops the batch when a later reservation loses the remaining slot', async () => {
    state.ready = [readyRow, { ...readyRow, id: 'recall-2' }];
    state.reserveRecallSend
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(runEmailRecall()).resolves.toEqual({
      status: 'capped',
      sent: 1,
    });
    expect(state.sendEmail).toHaveBeenCalledOnce();
    expect(state.releaseRecallSendReservation).not.toHaveBeenCalled();
  });

  it('returns a reservation when the row was already claimed', async () => {
    state.ready = [readyRow];
    state.claimRecallSend.mockResolvedValue(null);
    await expect(runEmailRecall()).resolves.toEqual({
      status: 'completed',
      sent: 0,
    });
    expect(state.sendEmail).not.toHaveBeenCalled();
    expect(state.releaseRecallSendReservation).toHaveBeenCalledOnce();
  });

  it('pauses when the quota sentence arrives without the documented error name', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T18:00:00.000Z'));
    try {
      state.ready = [readyRow, { ...readyRow, id: 'recall-2' }];
      state.sendEmail.mockResolvedValue({
        success: false,
        error: 'You have exceeded your daily email sending quota.',
        errorName: 'application_error',
        provider: 'resend',
      });
      await expect(runEmailRecall()).resolves.toEqual({
        status: 'paused',
        sent: 0,
      });
      expect(state.sendEmail).toHaveBeenCalledOnce();
      expect(state.releaseRecallSendReservation).toHaveBeenCalledOnce();
      expect(state.releaseRecallSend).toHaveBeenCalledWith(
        'recall-1',
        'claim-1'
      );
      expect(state.saveConfigs).toHaveBeenCalledWith({
        email_recall_paused_until: '2026-10-17T00:00:00.000Z',
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
