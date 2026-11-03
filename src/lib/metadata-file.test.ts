import { describe, expect, it } from 'vitest';

import { formatFileSize, metadataFileKind } from './metadata-file';

describe('metadataFileKind', () => {
  it('maps the homepage formats and rejects everything else', () => {
    expect(metadataFileKind('report.PDF')).toBe('pdf');
    expect(metadataFileKind('C:\\docs\\brief.DOCX')).toBe('ooxml');
    expect(metadataFileKind('sheet.xlsx')).toBe('ooxml');
    expect(metadataFileKind('export.csv')).toBe('csv');
    expect(metadataFileKind('legacy.doc')).toBe('legacy');
    expect(metadataFileKind('legacy.xls')).toBe('legacy');
    expect(metadataFileKind('clip.mp4')).toBe('unknown');
    expect(metadataFileKind('notes')).toBe('unknown');
    expect(metadataFileKind('.pdf')).toBe('unknown');
  });
});

describe('formatFileSize', () => {
  it('uses bytes, kilobytes, and megabytes', () => {
    expect(formatFileSize(12)).toBe('12 B');
    expect(formatFileSize(10_000_000)).toBe('10.0 MB');
    expect(formatFileSize(2000)).toBe('2.0 KB');
    expect(formatFileSize(2_500_000)).toBe('2.5 MB');
  });
});
