import { describe, expect, it } from 'vitest';

import {
  renderRecallEmail,
  type RecallEmailParams,
} from './email-recall-template';

const params: RecallEmailParams = {
  appName: 'Example Studio',
  appUrl: 'https://studio.example',
  logoUrl: 'https://cdn.example/logo.png',
  locale: 'en',
  kind: 'checkout',
  checkoutUrl: 'https://studio.example/checkout?plan=creator&source=email',
  unsubscribeUrl:
    'https://studio.example/unsubscribe?token=example&scope=recall',
};

describe('renderRecallEmail', () => {
  it.each([
    [
      'en',
      'checkout',
      'The most faithful recast. Try it yourself.',
      'started checkout',
      'Unsubscribe from these emails',
    ],
    [
      'en',
      'paywall',
      'Try the most faithful recast on the web',
      'viewed video creation plans',
      'Unsubscribe from these emails',
    ],
    [
      'es',
      'checkout',
      'La recreación más fiel. Compruébalo.',
      'iniciaste el pago',
      'Dejar de recibir estos correos',
    ],
    [
      'es',
      'paywall',
      'Prueba la recreación más fiel de la web',
      'consultaste los planes de creación de vídeos',
      'Dejar de recibir estos correos',
    ],
  ] as const)(
    'renders %s %s copy and translated footer',
    (locale, kind, subject, reason, unsubscribe) => {
      const email = renderRecallEmail({ ...params, locale, kind });
      expect(email.subject).toBe(subject);
      expect(email.html).toContain(`<html lang="${locale}">`);
      expect(email.html).toContain(reason);
      expect(email.html).toContain(unsubscribe);
      expect(email.text).toContain(reason);
      expect(email.text).toContain(`${unsubscribe}: ${params.unsubscribeUrl}`);
      expect(email.html).toContain('alt="Example Studio"');
      expect(email.html).not.toContain('Bulin');
      expect(email.html).toContain('src="https://cdn.example/logo.png"');
      expect(email.html).toContain('mso-hide:all;');
    }
  );

  it('escapes brand, image attributes and URL query separators', () => {
    const email = renderRecallEmail({
      ...params,
      appName: 'Studio <img src=x onerror="alert(1)"> & \'team\'',
      logoUrl: 'https://cdn.example/logo.png?size=44&label="brand"',
    });
    expect(email.html).toContain(
      'Studio &lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;team&#39;'
    );
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img src=x');
    expect(email.html).toContain('size=44&amp;label=%22brand%22');
    expect(email.html).toContain('plan=creator&amp;source=email');
    expect(email.html).toContain('token=example&amp;scope=recall');
  });

  it.each(['en', 'es'] as const)(
    'does not mention a bonus in %s emails',
    (locale) => {
      for (const kind of ['checkout', 'paywall'] as const) {
        const email = renderRecallEmail({ ...params, locale, kind });
        expect(email.subject).not.toMatch(/bonus|recompensa/i);
        expect(email.html).not.toMatch(/bonus|recompensa/i);
        expect(email.text).not.toMatch(/bonus|recompensa/i);
      }
    }
  );

  it.each(['appUrl', 'logoUrl', 'checkoutUrl', 'unsubscribeUrl'] as const)(
    'rejects unsafe protocols and credentials in %s',
    (field) => {
      for (const url of [
        'javascript:alert(1)',
        'data:image/png;base64,abc',
        'http://studio.example/checkout',
        'https://user:password@studio.example/checkout',
        '/relative',
        'https://studio.example/\ncheckout',
      ]) {
        expect(() => renderRecallEmail({ ...params, [field]: url })).toThrow(
          `Invalid ${field}`
        );
      }
    }
  );

  it.each(['checkoutUrl', 'unsubscribeUrl'] as const)(
    'requires the exact application origin for %s',
    (field) => {
      for (const url of [
        'https://evil.example/checkout',
        'https://studio.example.evil.example/checkout',
        'https://studio.example:8443/checkout',
      ]) {
        expect(() => renderRecallEmail({ ...params, [field]: url })).toThrow(
          'same origin'
        );
      }
    }
  );

  it('supports HTTP only on localhost for development', () => {
    expect(() =>
      renderRecallEmail({
        ...params,
        appUrl: 'http://localhost:3000',
        logoUrl: 'http://localhost:3000/logo.png',
        checkoutUrl: 'http://localhost:3000/checkout',
        unsubscribeUrl: 'http://localhost:3000/unsubscribe',
      })
    ).not.toThrow();
    expect(() =>
      renderRecallEmail({
        ...params,
        logoUrl: 'http://localhost.evil.example/logo.png',
      })
    ).toThrow('Invalid logoUrl');
  });
});
