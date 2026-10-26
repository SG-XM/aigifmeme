#!/usr/bin/env node
/**
 * New-site launch checklist — read-only GETs against a deployed site.
 *
 *   node scripts/launch-check.mjs https://your-domain.com
 *   LAUNCH_CHECK_URL=https://your-domain.com pnpm launch:check
 *   pnpm launch:check -- https://your-domain.com [--timeout=15000]
 *
 * Checks the pages and endpoints a fresh deployment must serve:
 * home, pricing, blog, terms/privacy in en/zh/es/ar, sitemap, robots, and
 * the public top-up catalog (must be non-empty and contain the public
 * packs; the retention product single_retention_v2 is deliberately hidden
 * from that API, so its presence is reported as info, not a failure).
 * Prints a pass/fail table and exits non-zero on any failure.
 */

const args = process.argv.slice(2).filter((a) => a !== '--');
const timeoutArg = args.find((a) => a.startsWith('--timeout='));
const timeoutMs = timeoutArg
  ? Number(timeoutArg.split('=')[1]) || 15000
  : 15000;
const baseArg = args.find((a) => !a.startsWith('--'));
const base = (baseArg || process.env.LAUNCH_CHECK_URL || '').replace(
  /\/+$/,
  ''
);

if (!base || !/^https?:\/\//.test(base)) {
  console.error(
    'Usage: node scripts/launch-check.mjs <base-url> [--timeout=ms]\n' +
      '   or: LAUNCH_CHECK_URL=<base-url> pnpm launch:check'
  );
  process.exit(2);
}

const LOCALES = ['', '/zh', '/es', '/ar'];
const checks = [];

for (const prefix of LOCALES) {
  const label = prefix ? prefix.slice(1) : 'en';
  checks.push({
    name: `home (${label})`,
    path: `${prefix}/` || '/',
    expect: 200,
  });
  checks.push({
    name: `terms (${label})`,
    path: `${prefix}/terms-of-service`,
    expect: 200,
  });
  checks.push({
    name: `privacy (${label})`,
    path: `${prefix}/privacy-policy`,
    expect: 200,
  });
}
checks.push(
  { name: 'pricing', path: '/pricing', expect: 200 },
  { name: 'blog', path: '/blog', expect: 200 },
  { name: 'sitemap', path: '/sitemap.xml', expect: 200 },
  { name: 'robots', path: '/robots.txt', expect: 200 },
  {
    name: 'top-up products API',
    path: '/api/top-up-products',
    expect: 200,
    json: (data) => {
      const ids = Array.isArray(data?.data)
        ? data.data.map((p) => p.productId)
        : [];
      const missing = ['single_v2', 'duo_v2'].filter((id) => !ids.includes(id));
      const hiddenRetention = [
        'single_retention_v2',
        'single_retention_name_499',
        'single_retention_name_599',
        'single_retention_name_799',
        'single_retention_name_999',
      ];
      const leaked = hiddenRetention.filter((id) => ids.includes(id));
      return {
        pass: ids.length > 0 && missing.length === 0 && leaked.length === 0,
        detail:
          ids.length === 0
            ? 'catalog is empty — run pnpm db:init-pricing -- --apply'
            : missing.length
              ? `missing public pack(s): ${missing.join(', ')} (found: ${ids.join(', ')})`
              : leaked.length
                ? `hidden retention product(s) leaked: ${leaked.join(', ')}`
                : `public packs ok (${ids.join(', ')}); retention products hidden`,
      };
    },
  }
);

async function runCheck(check) {
  const url = `${base}${check.path}`;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'launch-check/1.0' },
    });
    if (check.json) {
      if (res.status !== check.expect)
        return { ...check, pass: false, detail: `HTTP ${res.status}` };
      const verdict = check.json(await res.json().catch(() => null));
      return { ...check, pass: verdict.pass, detail: verdict.detail };
    }
    return {
      ...check,
      pass: res.status === check.expect,
      detail: `HTTP ${res.status}`,
    };
  } catch (error) {
    return { ...check, pass: false, detail: String(error?.message || error) };
  }
}

const results = [];
for (const check of checks) results.push(await runCheck(check));

const nameWidth = Math.max(...results.map((r) => r.name.length));
let failures = 0;
for (const r of results) {
  if (!r.pass) failures++;
  console.log(
    `${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(nameWidth)}  ${r.path.padEnd(28)}  ${r.detail}`
  );
}
console.log(
  `\n${results.length - failures}/${results.length} checks passed for ${base}`
);
process.exit(failures ? 1 : 0);
