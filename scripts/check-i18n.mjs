import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const project = JSON.parse(
  await fs.readFile(path.join(root, 'project.inlang', 'settings.json'), 'utf8')
);
const locales = project.locales;
const baseLocale = project.baseLocale;
const catalogs = Object.fromEntries(
  await Promise.all(
    locales.map(async (locale) => [
      locale,
      JSON.parse(
        await fs.readFile(path.join(root, 'messages', `${locale}.json`), 'utf8')
      ),
    ])
  )
);

const messageKeys = (catalog) =>
  Object.keys(catalog)
    .filter((key) => !key.startsWith('$'))
    .sort();
const baseKeys = messageKeys(catalogs[baseLocale]);
const failures = [];

for (const locale of locales.filter((locale) => locale !== baseLocale)) {
  const localeKeys = messageKeys(catalogs[locale]);
  const missing = baseKeys.filter((key) => !(key in catalogs[locale]));
  const extra = localeKeys.filter((key) => !(key in catalogs[baseLocale]));

  for (const key of missing)
    failures.push(`${locale}: missing source key ${key}`);
  for (const key of extra)
    failures.push(`${locale}: unexpected source key ${key}`);
}

const generatedUrl = pathToFileURL(
  path.join(root, 'src', 'paraglide', 'messages.js')
);
generatedUrl.searchParams.set('check', String(Date.now()));
const { m } = await import(generatedUrl.href);

function inputsFor(message) {
  const inputs = {};
  for (const match of message.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)/g)) {
    inputs[match[1]] = 1;
  }
  return inputs;
}

for (const key of baseKeys) {
  const message = m[key];
  if (typeof message !== 'function') {
    failures.push(`generated output: missing message function ${key}`);
    continue;
  }

  for (const locale of locales) {
    try {
      const output = message(inputsFor(catalogs[locale][key]), { locale });
      if (output === key) {
        failures.push(
          `${locale}: generated message fell back to raw key ${key}`
        );
      }
    } catch (error) {
      failures.push(
        `${locale}: generated message ${key} threw ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`i18n check failed (${failures.length} issue(s)):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `i18n check passed: ${baseKeys.length} messages across ${locales.length} locales`
);
