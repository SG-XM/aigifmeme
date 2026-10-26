# Admin Credit Gift Email Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a built-in credit-gift email template to the admin batch email dialog, with preset and custom positive-integer credit amounts.

**Architecture:** A pure helper builds the subject and branded HTML from a validated amount plus public app configuration. The existing admin dialog exposes the template and amount controls, then applies the generated values to the existing form. Existing preview, test-send, and batch-send API remain unchanged.

**Tech Stack:** TanStack Start, React, TanStack Form, shadcn Select/Input, Paraglide messages, TypeScript.

---

## File map

- Create `src/components/admin/credit-gift-email-template.ts`: validate the amount and return the subject and HTML. Keep the email markup and embedded logo out of the dialog component.
- Modify `src/components/admin/manual-email-dialog.tsx`: add the built-in template selector, amount controls, overwrite hint, and apply action.
- Modify `messages/en.json`, `messages/zh.json`, `messages/es.json`, and `messages/ar.json`: add translated labels and validation copy.
- The approved design is recorded at `docs/plans/2026-10-13-admin-credit-email-template-design.md`.

### Task 1: Add the credit-gift email generator

**Files:**

- Create: `src/components/admin/credit-gift-email-template.ts`

- [ ] **Step 1: Add a pure renderer with positive-integer and URL validation**

```ts
const LOGO_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAMAAABiM0N1AAAAkFBMVEUiIjNgLi4rlqYVMkaLkZtM3uYcWGpQWWiROizRTjHpGnaqGmJcGkj/GYO5RC0idYdAtcJ/h5E8tsLP0tYLGS77WzQSGy7+YTP9/f3oVjQMGzC2SDOIPDGoRDJoMzBGKjAnIS54ODHYUTOaQTIBDCPHTTITHDE4JjBHKi42JS5VLjCSPjFX+/0CCB7U1tpbMDC9ypdAAAAE4klEQVR42q1Y54KjOAw2kEYys7t35zKOscH0kvL+b3cSkDohgczqx+7EoI9PslUs8tXJYbb06EW2dJR4y9l/PQDpYJZ5St+SNF8eLkAzmtLt9h0c0Erp7AT0z57m9G3J6X7WAc3277G5sEIk8nWgPxWgcQCgZZr/FClPl1/k8GOYltSBzNInDuKkKssyRCki/gQnnZHl8OGrlWRXInU47KUl8QbZaMYEu5VgEMgjg3QVcDBF1Ashhb1Gyu9dOwh0BJzqzlRAKjq29GP9MRIow8/f+JcjyaRf23yuxwFFjMUR5VGF2wZSRbBrpWSyw8nXwIi/BuKUJDbQ2fWuyThLrE14Z9nn5hZniBE3t1t/RlPHzrI1OntDXgEVPhsQIRRByz5aP22eAnHYHtHqiDuM7j9W0fwDwT7Xm/w5I6UDa4yxjYpZjwlGNeaIsVJbp1Vcf26c5z4qagOOVkrpxDq1WaksU4E5GoCVILFKAkPox4Y8dzaJMx9YxP6vVeb7UvraOo7VMZM+IDcrBU9jJb/r3fvnKKojq/k2XfymiwUhRgo0z5I2yD3X87w4ICy82/3vjAom4UgDzm7xez5vFwDI9LE5n3s71wHoiL6MtYaxGnTmrrebe6BbMGtwBdb27o78u/MIY5a+BqKahaAyJ/PdYg+5ysQ0zVatYcgSFgvW0NdAnIai3oOKu3Pb5KmbsnaylhGyhMWQVXQMI8IceH+xm7fPuIRQLWREO5Zz5Mj4KCAuV51hQIjTRB3B11pTMMxzYTGnKqNjgHiRsIX3Z+6ig+DrRYwpjjlg2GLn7nPIMLYcxagJ2S/uugjDAxZqDDAdssDbui5mqjguV6OcrXQl2cpxTKCkX626iG0K31crXBNx5CeUjwDSIikMxlWWOFUmulIisvKYZBBp2ql+idUIIDxHTCZOCHXRKMG0rcMQgo0JZRzIuQ5WqdFApwwk7Vkht11CwcQpgtGMOEcFTNCRabRuTNRVTJbRagojWYC/MaBCdUqVGioalMiYl5NNg4gP2gQpuzpg299skmkoSVu1ma4jzisDf4p+ZSKjGKID/i3OJVwikWgKI9Ub5oBrr94vwMCKBmIiUEypzyTmwTo6FymmOkpTgBrUs/A+pF5zeRDRTEwDqsFDbcMQgp6K+rZGmLSZCFTApxXtgLCItO9K2Dgz0bSIxkyfgFjv9lhobMB+BIRmbt8BqqBlUxegti0C0xpqJztbX5ztd32xg6crEVO3/9hvvzhXQ4XQ8fgQ6Q8kjztKpjp1BRh/5RshYm5DBCDgpOupQEJ2QXu+NeD5cWjZ5qYJQDbAzdegpAx0xqXNWpJgrgV4YcdVkTZksbmhVp76SMFg6zic9pTDj+MoIDQiSLpEFgVx30FCv4g1lwWaPeiOBmr/qYiAh1Ja1dCE8rbqdtTaL4wBOkVFG2Kmz0ZhI0/NsvD5SCBaqKv2Os6UutwlhJDJw6skeXgTKWwDuqJv20W35/inzAKH0NGM4ARgpYaWPQiCVdCLY0zogK+bx0DeI0YWPv7w2qnhgfNw3DJwOTZJAre1b0IrndQDl+NZ+hcu/nhdPzy8rfOhSz5//CQ//L2RBg5ZRgxrXrxyGBj7bN8Z+yDS/SBqOwHrMog6jca2V9/AX9vJo7H7Yd12gnG3w7pufEimbxdZzg79+PB/myC0wzeJyoMAAAAASUVORK5CYII=';

function escapeHtml(value: string) {
  const escaped: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => escaped[character]);
}

export function createCreditGiftEmailTemplate(
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
  const href = escapeHtml(url.toString());
  const subject = `Your ${credits} ${appName} credits are ready`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#fff7f8;font-family:Arial,Helvetica,sans-serif;color:#20212a">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${credits} credits have been added to your ${name} account.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto"><tr><td style="padding:12px 0">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff;border:1px solid #f2dfe4;border-radius:16px"><tr><td style="padding:32px">
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="vertical-align:middle;padding-right:14px"><img src="${LOGO_DATA_URI}" width="64" height="64" alt="${name}" style="display:block;width:64px;height:64px;border:0;border-radius:12px"></td><td style="vertical-align:middle"><p style="margin:0;color:#20212a;font-size:17px;font-weight:700">${name}</p><p style="margin:5px 0 0;color:#77717a;font-size:13px">AI video creation</p></td></tr></table>
<div style="height:1px;margin:26px 0;background:#f2e8eb"></div>
<p style="margin:0 0 12px;color:#b91845;font-size:13px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">A little something for your next creation</p>
<h1 style="margin:0 0 16px;color:#20212a;font-size:28px;line-height:1.25">Your ${credits} credits are ready</h1>
<p style="margin:0 0 22px;color:#514b54;font-size:16px;line-height:1.65">We’ve added ${credits} credits to your ${name} account. You can use them whenever you’re ready to create a video.</p>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="padding:13px 18px;background:#fce9ee;border:1px solid #f5cbd6;border-radius:10px"><span style="color:#b91845;font-size:14px;font-weight:700">${credits} bonus credits</span></td></tr></table>
<p style="margin:26px 0"><a href="${href}" style="display:inline-block;padding:13px 20px;background:#D51F50;border-radius:9px;color:#fff;text-decoration:none;font-size:15px;font-weight:700">Open ${name}</a></p>
<p style="margin:0;color:#77717a;font-size:13px;line-height:1.6">You’re receiving this email because ${credits} credits were added to your account.</p>
<p style="margin:22px 0 0;color:#514b54;font-size:14px;line-height:1.5">— The ${name} team</p>
</td></tr></table>
<p style="margin:16px 0 0;text-align:center;color:#8b858d;font-size:12px;line-height:1.5">${name} · <a href="${href}" style="color:#8b858d;text-decoration:underline">${escapeHtml(url.host)}</a></p>
</td></tr></table></body></html>`;

  return { subject, html };
}
```

### Task 2: Add amount controls and apply action to the existing dialog

**Files:**

- Modify: `src/components/admin/manual-email-dialog.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`
- Modify: `messages/es.json`
- Modify: `messages/ar.json`

- [ ] **Step 1: Add template state and an apply handler**

Use a template state of `'none' | 'credit-gift'`, a preset state of `'5' | '10' | '20' | '50' | 'custom'`, and a custom string defaulting to `'5'`. On apply, parse the selected amount with `Number`, reject it unless `Number.isSafeInteger(amount) && amount > 0`, then call `createCreditGiftEmailTemplate(amount, envConfigs.app_name, envConfigs.app_url)`. Set the form's subject and text to the returned values, clear template validation error, and switch `bodyFormat` to `'html'`.

- [ ] **Step 2: Render a translated selector and visible overwrite hint**

Import `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, and `SelectValue` from `@/components/ui/select`; use the existing `Input` and `Button` for the custom amount and apply action. Offer template values `none` and `credit-gift`; offer amount values `5`, `10`, `20`, `50`, and `custom`. Keep template selection and amount changes non-destructive until the administrator clicks Apply. Place an inline translated hint beside the button explaining that Apply replaces the subject and body.

- [ ] **Step 3: Add all UI messages in the four locale files**

Add `admin.users.email_template_label`, `admin.users.email_template_none`, `admin.users.email_template_credit_gift`, `admin.users.email_template_amount`, `admin.users.email_template_custom`, `admin.users.email_template_apply`, `admin.users.email_template_overwrite_hint`, and `admin.users.email_template_amount_invalid` to `messages/{en,zh,es,ar}.json` with native translations for each locale.

### Task 3: Verify, scan, and commit the feature

**Files:**

- Verify: `src/components/admin/credit-gift-email-template.ts`
- Verify: `src/components/admin/manual-email-dialog.tsx`
- Verify: `messages/{en,zh,es,ar}.json`

- [ ] **Step 1: Run the production build and i18n check**

Run: `pnpm build`

Expected: exit code 0 and `i18n check passed` across all locales. Project instructions prohibit adding or running a separate test suite unless requested; production build is the required gate.

- [ ] **Step 2: Review the exact diff and run both security scans**

Run before staging: `python3 .claude/skills/security-scan/scripts/scan_staged.py --worktree`

Stage only the design, plan, generator, dialog, and four translation files, then run: `python3 .claude/skills/security-scan/scripts/scan_staged.py`

Expected: no security findings; `git diff --check` is clean. Manually verify all interpolated app strings are HTML-escaped, the CTA URL is HTTP(S), and only a validated integer can enter the amount text.

- [ ] **Step 3: Commit and publish on main**

Commit the feature as `feat(admin): add credit gift email template`, merge it into the latest `main`, push, then deploy with the project command `pnpm run cf:deploy`. Do not include unrelated working-tree changes from other tasks.

- [ ] **Step 4: Smoke-check production**

Run:

```bash
curl -sS --noproxy '*' -o /dev/null -w '/ HTTP=%{http_code}\n' https://uptownfunkai.video/
curl -sS --noproxy '*' -o /dev/null -w '/api/config/public HTTP=%{http_code}\n' https://uptownfunkai.video/api/config/public
```

Expected: both endpoints return HTTP 200 and Wrangler reports a new Worker version.
