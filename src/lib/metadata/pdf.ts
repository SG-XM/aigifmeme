import {
  EncryptedPDFError,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFString,
  type PDFObject,
} from 'pdf-lib';

import {
  entry,
  withRemovable,
  type InspectResult,
  type MetadataEntry,
} from './types';

const INFO_FIELDS: Record<string, [string, string]> = {
  Title: ['title', 'Title'],
  Author: ['author', 'Author'],
  Subject: ['subject', 'Subject'],
  Keywords: ['keywords', 'Keywords'],
  Creator: ['creator', 'Creator'],
  Producer: ['producer', 'Producer'],
  CreationDate: ['created', 'CreationDate'],
  ModDate: ['modified', 'ModDate'],
};

const XMP_FIELDS: Array<[string, string, string]> = [
  ['title', 'title', 'title'],
  ['creator', 'author', 'creator'],
  ['description', 'description', 'description'],
  ['subject', 'keywords', 'subject'],
  ['rights', 'copyright', 'rights'],
  ['CreatorTool', 'creator', 'CreatorTool'],
  ['CreateDate', 'created', 'CreateDate'],
  ['ModifyDate', 'modified', 'ModifyDate'],
  ['MetadataDate', 'modified', 'MetadataDate'],
  ['Producer', 'producer', 'Producer'],
  ['Keywords', 'keywords', 'Keywords'],
];

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, {
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
  } catch (error) {
    if (error instanceof EncryptedPDFError) {
      const encrypted = new Error('encrypted');
      encrypted.name = 'encrypted';
      throw encrypted;
    }
    throw new Error('parse');
  }
}

function pdfText(value: PDFObject | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof PDFString || value instanceof PDFHexString) {
    const raw = value.decodeText();
    return formatPdfDate(raw);
  }
  if (value instanceof PDFName) return value.asString().replace(/^\//, '');
  return undefined;
}

function formatPdfDate(raw: string): string {
  const match = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(raw);
  if (!match) return raw;
  const [, year, month, day, hour, minute, second] = match;
  const date = [year, month, day].filter(Boolean).join('-');
  if (!hour) return date;
  return `${date} ${hour}:${minute ?? '00'}:${second ?? '00'}`;
}

function decodeXml(value: string): string {
  return value
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

function xmpEntries(xml: string): MetadataEntry[] {
  const rows: MetadataEntry[] = [];
  const seen = new Set<string>();
  for (const [local, id, label] of XMP_FIELDS) {
    const match = xml.match(
      new RegExp(
        `<(?:dc|pdf|xmp|xmpMM|photoshop):${local}\\b[^>]*>([\\s\\S]*?)</(?:dc|pdf|xmp|xmpMM|photoshop):${local}>`,
        'i'
      )
    );
    if (!match || seen.has(id + match[1])) continue;
    const row = entry('xmp', id, label, decodeXml(match[1]));
    if (!row) continue;
    seen.add(id + match[1]);
    rows.push(row);
  }
  return rows;
}

function infoEntries(doc: PDFDocument): MetadataEntry[] {
  const ref = doc.context.trailerInfo.Info;
  if (!ref) return [];
  const info = doc.context.lookup(ref);
  if (!(info instanceof PDFDict)) return [];
  const rows: MetadataEntry[] = [];
  for (const key of info.keys()) {
    const name = key.asString().replace(/^\//, '');
    const known = INFO_FIELDS[name];
    const text = pdfText(info.get(key));
    const row = entry(
      'pdf',
      known?.[0] ?? `info:${name}`,
      known?.[1] ?? name,
      text
    );
    if (row) rows.push(row);
  }
  return rows;
}

function metadataXml(doc: PDFDocument): string {
  const value = doc.catalog.get(PDFName.of('Metadata'));
  const object = value instanceof PDFRef ? doc.context.lookup(value) : value;
  if (!(object instanceof PDFRawStream)) return '';
  return new TextDecoder('utf-8', { fatal: false }).decode(
    object.getContents()
  );
}

export async function inspectPdf(bytes: Uint8Array): Promise<InspectResult> {
  const doc = await load(bytes);
  const rows = [...infoEntries(doc), ...xmpEntries(metadataXml(doc))];
  return withRemovable('pdf', rows);
}

function dropRef(doc: PDFDocument, value: PDFObject | undefined) {
  if (value instanceof PDFRef) doc.context.delete(value);
}

export async function stripPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await load(bytes);
  const info = doc.context.trailerInfo.Info;
  dropRef(doc, info);
  doc.context.trailerInfo.Info = undefined;

  const metadataName = PDFName.of('Metadata');
  dropRef(doc, doc.catalog.get(metadataName));
  doc.catalog.delete(metadataName);

  return doc.save({ useObjectStreams: false, updateFieldAppearances: false });
}
