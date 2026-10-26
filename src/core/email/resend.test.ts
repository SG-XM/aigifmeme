import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResendProvider } from './resend';

const state = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => state.send(...args) };
  },
}));

describe('ResendProvider quota errors', () => {
  beforeEach(() => {
    state.send.mockReset();
  });

  it('keeps the Resend error name for daily_quota_exceeded', async () => {
    state.send.mockResolvedValue({
      data: null,
      error: {
        name: 'daily_quota_exceeded',
        message: 'You have exceeded your daily email sending quota.',
      },
    });
    const result = await new ResendProvider({
      apiKey: 're_test',
      defaultFrom: 'hello@example.test',
    }).sendEmail({
      to: 'one@example.test',
      subject: 'Subject',
      text: 'Hi',
    });
    expect(result).toMatchObject({
      success: false,
      errorName: 'daily_quota_exceeded',
      error: 'You have exceeded your daily email sending quota.',
    });
  });

  it('reads a nested error name and a thrown quota name', async () => {
    state.send.mockResolvedValueOnce({
      data: null,
      error: {
        error: {
          name: 'monthly_quota_exceeded',
          message: 'You have exceeded your monthly email sending quota.',
        },
      },
    });
    const nested = await new ResendProvider({
      apiKey: 're_test',
      defaultFrom: 'hello@example.test',
    }).sendEmail({
      to: 'one@example.test',
      subject: 'Subject',
      text: 'Hi',
    });
    expect(nested).toMatchObject({
      success: false,
      errorName: 'monthly_quota_exceeded',
      error: 'You have exceeded your monthly email sending quota.',
    });

    const thrown = new Error(
      'You have exceeded your daily email sending quota.'
    );
    thrown.name = 'daily_quota_exceeded';
    state.send.mockRejectedValueOnce(thrown);
    const rejected = await new ResendProvider({
      apiKey: 're_test',
      defaultFrom: 'hello@example.test',
    }).sendEmail({
      to: 'one@example.test',
      subject: 'Subject',
      text: 'Hi',
    });
    expect(rejected).toMatchObject({
      success: false,
      errorName: 'daily_quota_exceeded',
    });
  });
});
