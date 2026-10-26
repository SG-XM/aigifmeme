export interface RecallEmailParams {
  appName: string;
  appUrl: string;
  logoUrl: string;
  locale: 'en' | 'es';
  kind: 'checkout' | 'paywall';
  checkoutUrl: string;
  unsubscribeUrl: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function validateUrl(value: string, name: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid ${name}: an absolute URL is required`);
  }
  if (
    /[\u0000-\u0020\u007f]/.test(value) ||
    url.username ||
    url.password ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && url.hostname === 'localhost'))
  ) {
    throw new Error(
      `Invalid ${name}: use HTTPS (HTTP is allowed only for localhost)`
    );
  }
  return url;
}

function getCopy({ appName, locale, kind }: RecallEmailParams) {
  const checkout = kind === 'checkout';
  if (locale === 'es') {
    return {
      subject: checkout
        ? 'La recreación más fiel. Compruébalo.'
        : 'Prueba la recreación más fiel de la web',
      preheader: checkout
        ? 'Completa el pago y pruébalo.'
        : 'Tu foto en la escena original. Pruébalo.',
      headline: 'La recreación más fiel de la web.',
      greeting: 'Hola,',
      introduction: `Tu foto. Los movimientos, la cámara y la escena del vídeo original. Recréalo con ${appName}.`,
      cta: checkout ? 'Completar pago y probar' : 'Pruébalo ahora',
      help: checkout
        ? '¿Necesitas ayuda con el pago? Responde a este correo.'
        : 'Elige un efecto, sube tu foto y compruébalo. ¿Tienes dudas? Responde a este correo.',
      signature: `El equipo de ${appName}`,
      reason: checkout
        ? `Recibes este correo porque iniciaste el pago en ${appName}.`
        : `Recibes este correo porque consultaste los planes de creación de vídeos en ${appName}.`,
      unsubscribe: 'Dejar de recibir estos correos',
    };
  }
  return {
    subject: checkout
      ? 'The most faithful recast. Try it yourself.'
      : 'Try the most faithful recast on the web',
    preheader: checkout
      ? 'Finish checkout and try it.'
      : 'Your photo in the original scene. Try it.',
    headline: 'The most faithful recast on the web.',
    greeting: 'Hi there,',
    introduction: `Your photo. The original moves, camera and scene. Recreate it with ${appName}.`,
    cta: checkout ? 'Finish checkout & try it' : 'Try it now',
    help: checkout
      ? 'Need a hand with checkout? Just reply to this email.'
      : 'Choose an effect, add your photo and see for yourself. Questions? Just reply.',
    signature: `The ${appName} team`,
    reason: checkout
      ? `You're receiving this because you started checkout on ${appName}.`
      : `You're receiving this because you viewed video creation plans on ${appName}.`,
    unsubscribe: 'Unsubscribe from these emails',
  };
}

/** Pure renderer: callers supply public logo and first-party action URLs. */
export function renderRecallEmail(params: RecallEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  if (
    !['en', 'es'].includes(params.locale) ||
    !['checkout', 'paywall'].includes(params.kind)
  ) {
    throw new Error('Unsupported recall email locale or kind');
  }
  const appUrl = validateUrl(params.appUrl, 'appUrl');
  const logoUrl = validateUrl(params.logoUrl, 'logoUrl');
  const checkoutUrl = validateUrl(params.checkoutUrl, 'checkoutUrl');
  const unsubscribeUrl = validateUrl(params.unsubscribeUrl, 'unsubscribeUrl');
  for (const [name, url] of [
    ['checkoutUrl', checkoutUrl],
    ['unsubscribeUrl', unsubscribeUrl],
  ] as const) {
    if (url.origin !== appUrl.origin) {
      throw new Error(`Invalid ${name}: must have the same origin as appUrl`);
    }
  }

  const c = getCopy(params);
  const preheader = c.preheader;
  const esc = escapeHtml;
  const html = `<!doctype html>
<html lang="${params.locale}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(c.subject)}</title>
<style>
@media only screen and (max-width:620px){.outer-pad{padding:16px 12px!important}.brand-pad{padding:26px 24px 22px!important}.content-pad{padding:30px 24px 34px!important}.footer-pad{padding:24px 12px!important}.headline{font-size:28px!important;line-height:1.25!important}}
</style>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F5;color:#20212A;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;color:#F3F4F5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#F3F4F5;">
<tr><td align="center" class="outer-pad" style="padding:40px 20px 16px;">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#FFFFFF;border:1px solid #E1E3E7;">
<tr><td class="brand-pad" style="padding:30px 40px 26px;border-bottom:1px solid #E5E7EB;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
<td width="44" valign="middle" style="width:44px;"><img src="${esc(logoUrl.href)}" width="44" height="44" alt="${esc(params.appName)}" style="display:block;width:44px;height:44px;border:0;border-radius:10px;"></td>
<td valign="middle" style="padding-left:13px;font-size:20px;line-height:26px;font-weight:700;letter-spacing:-0.4px;color:#20212A;">${esc(params.appName)}</td>
</tr></table>
</td></tr>
<tr><td class="content-pad" style="padding:38px 40px 40px;">
<h1 class="headline" style="margin:0 0 30px;font-size:32px;line-height:1.22;letter-spacing:-0.8px;font-weight:700;color:#20212A;">${esc(c.headline)}</h1>
<p style="margin:0 0 14px;font-size:16px;line-height:1.75;color:#20212A;">${esc(c.greeting)}</p>
<p style="margin:0;font-size:16px;line-height:1.75;color:#20212A;">${esc(c.introduction)}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 30px;"><tr><td align="center" bgcolor="#D51F50" style="background-color:#D51F50;border-radius:6px;mso-padding-alt:15px 24px;">
<a href="${esc(checkoutUrl.href)}" style="display:inline-block;padding:15px 24px;font-size:16px;font-weight:700;line-height:22px;text-align:center;color:#FFFFFF;text-decoration:none;border:1px solid #D51F50;border-radius:6px;">${esc(c.cta)}</a>
</td></tr></table>
<p style="margin:0 0 28px;font-size:16px;line-height:1.75;color:#20212A;">${esc(c.help)}</p>
<p style="margin:0;font-size:16px;line-height:1.75;font-weight:700;color:#20212A;">${esc(c.signature)}</p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;"><tr><td align="left" class="footer-pad" style="padding:24px 40px 28px;">
<p style="margin:0 0 10px;font-size:12px;line-height:1.7;color:#626571;">${esc(c.reason)}</p>
<p style="margin:0;font-size:12px;line-height:1.7;"><a href="${esc(unsubscribeUrl.href)}" style="color:#535661;text-decoration:underline;">${esc(c.unsubscribe)}</a></p>
</td></tr></table>
</td></tr></table>
</body>
</html>`;
  const text = [
    params.appName,
    c.headline,
    c.greeting,
    c.introduction,
    `${c.cta}: ${checkoutUrl.href}`,
    c.help,
    c.signature,
    c.reason,
    `${c.unsubscribe}: ${unsubscribeUrl.href}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { subject: c.subject, html, text };
}
