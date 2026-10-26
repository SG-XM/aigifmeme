import { CloudflareEmailProvider } from './cloudflare';
import type { EmailProvider } from './index';
import { ResendProvider } from './resend';

export interface ConfiguredEmailProvider {
  provider: EmailProvider;
  from: string;
}

/** Display name comes from the app name. An address that already has one is kept. */
export function emailSenderAddress(
  email: string | undefined,
  name: string | undefined
): string {
  const address = email?.trim() ?? '';
  if (!address || address.includes('<')) return address;
  const display = (name ?? '').replace(/[\r\n<>"]/g, '').trim();
  return display ? `${display} <${address}>` : address;
}

/** Build the selected provider from admin settings, or return null if incomplete. */
export function createEmailProviderFromConfig(
  configs: Record<string, string>
): ConfiguredEmailProvider | null {
  if ((configs.email_provider || 'resend') === 'cloudflare') {
    const apiToken = configs.cloudflare_email_api_token;
    const accountId = configs.cloudflare_email_account_id;
    const from = emailSenderAddress(
      configs.cloudflare_email_sender_email,
      configs.app_name
    );
    if (!apiToken || !accountId || !from) return null;

    return {
      provider: new CloudflareEmailProvider({
        apiToken,
        accountId,
        defaultFrom: from,
      }),
      from,
    };
  }

  const apiKey = configs.resend_api_key;
  const from = emailSenderAddress(
    configs.resend_sender_email,
    configs.app_name
  );
  if (!apiKey || !from) return null;

  return {
    provider: new ResendProvider({ apiKey, defaultFrom: from }),
    from,
  };
}
