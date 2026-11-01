import {
  entry,
  withRemovable,
  type InspectResult,
  type MetadataEntry,
} from './types';
import { readZip, writeZip, type ZipEntry } from './zip';

const CORE_EMPTY = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>
`;

const APP_EMPTY = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"/>
`;

const CUSTOM_EMPTY = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"/>
`;

const CORE_FIELDS: Array<[string, string, string]> = [
  ['title', 'title', 'title'],
  ['subject', 'subject', 'subject'],
  ['creator', 'author', 'creator'],
  ['description', 'description', 'description'],
  ['lastModifiedBy', 'last-modified-by', 'lastModifiedBy'],
  ['revision', 'revision', 'revision'],
  ['keywords', 'keywords', 'keywords'],
  ['category', 'category', 'category'],
  ['created', 'created', 'created'],
  ['modified', 'modified', 'modified'],
  ['lastPrinted', 'last-printed', 'lastPrinted'],
];

const APP_FIELDS: Array<[string, string, string]> = [
  ['Application', 'application', 'Application'],
  ['Company', 'company', 'Company'],
  ['Manager', 'manager', 'Manager'],
  ['AppVersion', 'app-version', 'AppVersion'],
  ['Template', 'template', 'Template'],
  ['TotalTime', 'total-time', 'TotalTime'],
  ['HyperlinkBase', 'hyperlink-base', 'HyperlinkBase'],
];

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16))
    )
    .replace(/&amp;/g, '&');
}

function textOf(xml: string, local: string): string | undefined {
  const match = xml.match(
    new RegExp(
      `<(?:[\\w.-]+:)?${local}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${local}>`,
      'i'
    )
  );
  if (!match) return undefined;
  return decodeXml(match[1]);
}

function part(entries: ZipEntry[], name: string): ZipEntry | undefined {
  const wanted = name.toLowerCase();
  return entries.find((item) => item.name.toLowerCase() === wanted);
}

function xmlOf(item: ZipEntry | undefined): string {
  if (!item) return '';
  return new TextDecoder('utf-8').decode(item.data);
}

function pushFields(
  entries: MetadataEntry[],
  group: MetadataEntry['group'],
  xml: string,
  fields: Array<[string, string, string]>
) {
  for (const [local, id, label] of fields) {
    const row = entry(group, id, label, textOf(xml, local));
    if (row) entries.push(row);
  }
}

function customEntries(xml: string): MetadataEntry[] {
  const rows: MetadataEntry[] = [];
  const blocks = xml.matchAll(/<property\b([^>]*)>([\s\S]*?)<\/property>/gi);
  for (const block of blocks) {
    const name = /name="([^"]*)"/i.exec(block[1])?.[1] ?? 'property';
    const row = entry(
      'custom',
      `custom:${name}`,
      decodeXml(name),
      decodeXml(block[2])
    );
    if (row) rows.push(row);
  }
  return rows;
}

export async function inspectOoxml(bytes: Uint8Array): Promise<InspectResult> {
  const files = await readZip(bytes);
  const rows: MetadataEntry[] = [];
  pushFields(
    rows,
    'core',
    xmlOf(part(files, 'docProps/core.xml')),
    CORE_FIELDS
  );
  pushFields(rows, 'app', xmlOf(part(files, 'docProps/app.xml')), APP_FIELDS);
  rows.push(...customEntries(xmlOf(part(files, 'docProps/custom.xml'))));
  return withRemovable('ooxml', rows);
}

function replacePart(files: ZipEntry[], name: string, xml: string): boolean {
  const item = part(files, name);
  if (!item) return false;
  item.data = new TextEncoder().encode(xml);
  return true;
}

export async function stripOoxml(
  bytes: Uint8Array
): Promise<{ bytes: Uint8Array; changed: boolean }> {
  const files = await readZip(bytes);
  const core = replacePart(files, 'docProps/core.xml', CORE_EMPTY);
  const app = replacePart(files, 'docProps/app.xml', APP_EMPTY);
  const custom = replacePart(files, 'docProps/custom.xml', CUSTOM_EMPTY);
  if (!core && !app && !custom) return { bytes, changed: false };
  return { bytes: writeZip(files), changed: true };
}
