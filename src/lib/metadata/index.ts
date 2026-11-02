import { inspectCsv, stripCsv } from './csv';
import { inspectImage, sniffImage, stripImage } from './image';
import { inspectOoxml, stripOoxml } from './ooxml';
import { inspectPdf, stripPdf } from './pdf';
import {
  MAX_FILE_BYTES,
  withRemovable,
  type DocumentKind,
  type InspectResult,
  type MetadataIssue,
} from './types';

export { MAX_FILE_BYTES };
export type {
  DocumentKind,
  InspectResult,
  MetadataEntry,
  MetadataIssue,
} from './types';

function extension(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function documentKind(name: string): DocumentKind {
  const ext = extension(name);
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx' || ext === 'xlsx') return 'ooxml';
  if (ext === 'csv') return 'csv';
  if (ext === 'doc' || ext === 'xls') return 'legacy';
  if (
    ext === 'jpg' ||
    ext === 'jpeg' ||
    ext === 'png' ||
    ext === 'webp' ||
    ext === 'gif'
  ) {
    return 'image';
  }
  if (
    ext === 'mp4' ||
    ext === 'm4v' ||
    ext === 'mov' ||
    ext === 'webm' ||
    ext === 'mkv' ||
    ext === 'avi'
  ) {
    return 'video';
  }
  return 'unknown';
}

function startsWith(bytes: Uint8Array, text: string): boolean {
  if (bytes.length < text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function issueResult(kind: DocumentKind, issue: MetadataIssue): InspectResult {
  return withRemovable(kind, [], issue);
}

function asIssue(error: unknown): MetadataIssue {
  if (error instanceof Error && error.name === 'encrypted') return 'encrypted';
  return 'parse';
}

export async function inspectDocument(
  name: string,
  bytes: Uint8Array
): Promise<InspectResult> {
  if (bytes.byteLength > MAX_FILE_BYTES)
    return issueResult(documentKind(name), 'too-large');
  const kind = documentKind(name);
  try {
    if (kind === 'pdf') {
      if (!startsWith(bytes, '%PDF')) return issueResult('pdf', 'parse');
      return await inspectPdf(bytes);
    }
    if (kind === 'ooxml') {
      if (!(bytes[0] === 0x50 && bytes[1] === 0x4b))
        return issueResult('ooxml', 'parse');
      return await inspectOoxml(bytes);
    }
    if (kind === 'csv') return inspectCsv(bytes);
    if (kind === 'image' || sniffImage(bytes)) {
      if (!sniffImage(bytes)) return issueResult('image', 'parse');
      return inspectImage(bytes);
    }
    if (kind === 'video') return issueResult('video', 'video');
    if (kind === 'legacy') return issueResult('legacy', 'unsupported');
    return issueResult('unknown', 'unsupported');
  } catch (error) {
    return issueResult(kind, asIssue(error));
  }
}

export async function stripDocument(
  name: string,
  bytes: Uint8Array
): Promise<{ bytes: Uint8Array; changed: boolean }> {
  const kind = documentKind(name);
  if (kind === 'pdf') {
    const next = await stripPdf(bytes);
    return { bytes: next, changed: true };
  }
  if (kind === 'ooxml') return stripOoxml(bytes);
  if (kind === 'csv') return stripCsv(bytes);
  if (kind === 'image' || sniffImage(bytes)) {
    const cleaned = stripImage(bytes);
    if (!cleaned) throw new Error('strip');
    return cleaned;
  }
  return { bytes, changed: false };
}

export function cleanedDownloadName(name: string): string {
  const base = (name.split(/[/\\]/).pop() ?? 'file')
    .replace(/[^\w.\- ()[\]]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 160);
  const safe = base || 'file';
  const dot = safe.lastIndexOf('.');
  if (dot <= 0) return `${safe}-cleaned`;
  return `${safe.slice(0, dot)}-cleaned${safe.slice(dot)}`;
}

export function downloadMime(name: string): string {
  const ext = extension(name);
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (ext === 'xlsx') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (ext === 'csv') return 'text/csv';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'application/octet-stream';
}
