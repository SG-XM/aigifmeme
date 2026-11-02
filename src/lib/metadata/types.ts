/** Browser-local metadata inspection. Nothing here uploads the file. */

/** Decimal megabytes, matching the public 10 MB limit. */
export const MAX_FILE_BYTES = 10_000_000;

export type MetadataGroup =
  | 'pdf'
  | 'xmp'
  | 'core'
  | 'app'
  | 'custom'
  | 'csv'
  | 'exif';

export type MetadataEntry = {
  group: MetadataGroup;
  /** Stable id for labels. Custom properties use the document's own name. */
  id: string;
  label: string;
  value: string;
};

export type MetadataIssue =
  | 'unsupported'
  | 'encrypted'
  | 'too-large'
  | 'parse'
  | 'strip-failed'
  | 'video';

export type DocumentKind =
  | 'pdf'
  | 'ooxml'
  | 'csv'
  | 'legacy'
  | 'image'
  | 'video'
  | 'unknown';

export type InspectResult = {
  kind: DocumentKind;
  entries: MetadataEntry[];
  issue?: MetadataIssue;
  /** True when a strip would change bytes. */
  removable: boolean;
};

export function entry(
  group: MetadataGroup,
  id: string,
  label: string,
  value: string | undefined
): MetadataEntry | undefined {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  return { group, id, label, value: cleaned.slice(0, 2000) };
}

export function withRemovable(
  kind: DocumentKind,
  entries: MetadataEntry[],
  issue?: MetadataIssue
): InspectResult {
  return {
    kind,
    entries,
    issue,
    removable: !issue && entries.length > 0,
  };
}
