/**
 * Client-side metadata strip notes for the homepage preview.
 *
 * The dropzone does not upload or rewrite files. A later pass can do this
 * in the browser for some formats:
 *
 * - DOCX / XLSX are zip packages. Author, title, company, and timestamps
 *   live in `docProps/core.xml`, `docProps/app.xml`, and `docProps/custom.xml`.
 *   A browser zip rewrite can drop those parts. Comments, tracked changes,
 *   and hidden sheets can still carry names.
 * - PDF metadata is the Info dictionary plus an XMP metadata stream. Setting
 *   Info fields to empty does not remove XMP or older incremental updates.
 *   A real strip rewrites the file (for example MuPDF or qpdf compiled to
 *   WASM). Embedded files and annotations need the same rewrite.
 * - CSV usually has no property bag. The useful cleanup is a UTF-8 BOM and
 *   a leading Excel `sep=` line. Cell text is the document and stays.
 * - DOC / XLS are OLE compound files. Summary information sits in dedicated
 *   streams. There is no small browser library that strips those reliably.
 */

export type MetadataFileKind = 'pdf' | 'ooxml' | 'csv' | 'legacy' | 'unknown';

const EXTENSIONS: Record<string, MetadataFileKind> = {
  pdf: 'pdf',
  docx: 'ooxml',
  xlsx: 'ooxml',
  csv: 'csv',
  doc: 'legacy',
  xls: 'legacy',
};

export function metadataFileKind(name: string): MetadataFileKind {
  const base = name.split(/[/\\]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return 'unknown';
  return EXTENSIONS[base.slice(dot + 1).toLowerCase()] ?? 'unknown';
}

/** Decimal units match the public 10 MB input limit. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
