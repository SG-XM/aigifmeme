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

export function createCreditRedemptionEmailTemplate(
  credits: number,
  appName: string,
  appUrl: string
) {
  if (!Number.isSafeInteger(credits) || credits < 1) {
    throw new RangeError('Credits must be a positive safe integer');
  }
  const url = new URL(appUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError('App URL must use HTTP or HTTPS');
  }

  const name = escapeHtml(appName);
  const subject = `Redeem ${credits} credits for ${appName}`;
  const redeemUrl = `${url.origin}/redeem?code={{code}}&email={{emailQuery}}`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f7f7fb;font-family:Arial,Helvetica,sans-serif;color:#20212a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e7e7ee;border-radius:14px">
    <tr><td style="padding:32px">
      <p style="margin:0 0 10px;color:#6157d9;font-size:13px;font-weight:700;letter-spacing:.4px;text-transform:uppercase">${name}</p>
      <h1 style="margin:0 0 14px;font-size:28px;line-height:1.25">${credits} credits are waiting for you</h1>
      <p style="margin:0 0 22px;color:#555866;font-size:16px;line-height:1.6">Use the button below to enter your email and redeem your one-time code.</p>
      <p style="margin:0 0 22px"><a href="${redeemUrl}" style="display:inline-block;padding:13px 20px;background:#5146e5;border-radius:8px;color:#fff;text-decoration:none;font-size:15px;font-weight:700">Redeem ${credits} credits</a></p>
      <p style="margin:0;color:#727482;font-size:13px;line-height:1.6">Code: <strong>{{code}}</strong><br>Sent to: {{email}}<br>Redeem before the expiration date shown in your email.</p>
    </td></tr>
  </table>
</body></html>`;
  return { subject, html };
}
