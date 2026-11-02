import { deflateRawSync } from 'node:zlib';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { inspectCsv, stripCsv } from './csv';
import {
  cleanedDownloadName,
  inspectDocument,
  MAX_FILE_BYTES,
  stripDocument,
} from './index';
import { inspectOoxml, stripOoxml } from './ooxml';
import { readZip, writeZip } from './zip';

function text(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

function buildPdf(parts: string[]): Uint8Array {
  const header = '%PDF-1.4\n';
  let cursor = header.length;
  const chunks = [header];
  const offsets = [0];
  parts.forEach((body, index) => {
    const chunk = `${index + 1} 0 obj\n${body}\nendobj\n`;
    offsets.push(cursor);
    chunks.push(chunk);
    cursor += chunk.length;
  });
  let xref = `xref\n0 ${parts.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index++) {
    xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  chunks.push(
    xref,
    `trailer\n<< /Size ${parts.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${cursor}\n%%EOF\n`
  );
  return new TextEncoder().encode(chunks.join(''));
}

const XMP = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
<dc:creator><rdf:Seq><rdf:li>Jane Doe</rdf:li></rdf:Seq></dc:creator>
<pdf:Producer>Secret Producer</pdf:Producer>
</rdf:Description></rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;

function samplePdf(): Uint8Array {
  const page = 'BT /F1 12 Tf 50 50 Td (Hello body) Tj ET';
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R /Metadata 6 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 5 0 R >>',
    '<< /Title (Secret Title) /Author (Jane Doe) /Creator (Microsoft Word) /CreationDate (D:20240102131415Z) >>',
    `<< /Length ${page.length} >>\nstream\n${page}\nendstream`,
    `<< /Type /Metadata /Subtype /XML /Length ${XMP.length} >>\nstream\n${XMP}\nendstream`,
  ]);
}

describe('pdf metadata', () => {
  it('lists the author and XMP, then rewrites them out of the file', async () => {
    const source = samplePdf();
    const before = await inspectDocument('report.pdf', source);
    expect(before.issue).toBeUndefined();
    expect(before.removable).toBe(true);
    expect(before.entries.map((row) => [row.group, row.id, row.value])).toEqual(
      expect.arrayContaining([
        ['pdf', 'author', 'Jane Doe'],
        ['pdf', 'title', 'Secret Title'],
        ['pdf', 'creator', 'Microsoft Word'],
        ['pdf', 'created', '2024-01-02 13:14:15'],
        ['xmp', 'author', 'Jane Doe'],
        ['xmp', 'producer', 'Secret Producer'],
      ])
    );
    expect(before.entries.some((row) => row.id === 'description')).toBe(false);

    const cleaned = await stripDocument('report.pdf', source);
    expect(cleaned.changed).toBe(true);
    const decoded = text(cleaned.bytes);
    expect(decoded).toContain('Hello body');
    expect(decoded).not.toContain('Jane Doe');
    expect(decoded).not.toContain('Secret Title');
    expect(decoded).not.toContain('Secret Producer');
    expect(decoded).not.toContain('Microsoft Word');

    const after = await inspectDocument('report.pdf', cleaned.bytes);
    expect(after.removable).toBe(false);
    expect(after.entries).toEqual([]);
  });

  it('clears metadata written by a PDF library, including an attached XMP stream', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Hello body', { x: 40, y: 80, size: 12, font });
    doc.setAuthor('Jane Doe');
    doc.setTitle('Secret Title');
    const xmp = new TextEncoder().encode(XMP);
    const ref = doc.context.register(
      doc.context.stream(xmp, { Type: 'Metadata', Subtype: 'XML' })
    );
    doc.catalog.set(PDFName.of('Metadata'), ref);
    const source = await doc.save({ useObjectStreams: false });

    const before = await inspectDocument('library.pdf', source);
    expect(before.entries.some((row) => row.value === 'Jane Doe')).toBe(true);

    const cleaned = await stripDocument('library.pdf', source);
    expect(text(cleaned.bytes)).not.toContain('Jane Doe');
    expect(text(cleaned.bytes)).not.toContain('Secret Title');
    const after = await inspectDocument('library.pdf', cleaned.bytes);
    expect(after.entries.filter((row) => row.value === 'Jane Doe')).toEqual([]);
    expect(after.removable).toBe(false);
  });
});

describe('ooxml metadata', () => {
  it('reads and clears docProps while keeping the document text', async () => {
    const source = writeZip([
      {
        name: '[Content_Types].xml',
        data: new TextEncoder().encode('<Types/>'),
      },
      {
        name: 'word/document.xml',
        data: new TextEncoder().encode(
          '<w:document><w:t>Hello body</w:t></w:document>'
        ),
      },
      {
        name: 'docProps/core.xml',
        data: new TextEncoder().encode(
          '<cp:coreProperties><dc:creator>Jane Doe</dc:creator><dc:title>Secret Title</dc:title><dcterms:created>2024-01-02T00:00:00Z</dcterms:created><cp:lastModifiedBy>Jane Doe</cp:lastModifiedBy></cp:coreProperties>'
        ),
      },
      {
        name: 'docProps/app.xml',
        data: new TextEncoder().encode(
          '<Properties><Application>Microsoft Word</Application><Company>Acme</Company></Properties>'
        ),
      },
      {
        name: 'docProps/custom.xml',
        data: new TextEncoder().encode(
          '<Properties><property name="Owner"><vt:lpwstr>Jane Doe</vt:lpwstr></property></Properties>'
        ),
      },
    ]);

    const before = await inspectOoxml(source);
    expect(before.entries.map((row) => [row.id, row.value])).toEqual(
      expect.arrayContaining([
        ['author', 'Jane Doe'],
        ['title', 'Secret Title'],
        ['company', 'Acme'],
        ['application', 'Microsoft Word'],
        ['custom:Owner', 'Jane Doe'],
      ])
    );

    const cleaned = await stripOoxml(source);
    const files = await readZip(cleaned.bytes);
    const document = new TextDecoder().decode(
      files.find((file) => file.name === 'word/document.xml')!.data
    );
    const core = new TextDecoder().decode(
      files.find((file) => file.name === 'docProps/core.xml')!.data
    );
    const app = new TextDecoder().decode(
      files.find((file) => file.name === 'docProps/app.xml')!.data
    );
    expect(document).toContain('Hello body');
    expect(core).not.toContain('Jane Doe');
    expect(app).not.toContain('Acme');
    const after = await inspectOoxml(cleaned.bytes);
    expect(after.removable).toBe(false);
  });

  it('reads a deflated docx part', async () => {
    const xml = new TextEncoder().encode(
      '<cp:coreProperties><dc:creator>Jane Doe</dc:creator></cp:coreProperties>'
    );
    const stored = writeZip([
      { name: 'docProps/core.xml', data: xml },
      {
        name: 'word/document.xml',
        data: new TextEncoder().encode('<w:t>Hello body</w:t>'),
      },
    ]);
    const files = await readZip(stored);
    const compressed = deflateRawSync(files[0].data);
    const localName = new TextEncoder().encode('docProps/core.xml');
    const crc = 0;
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(8, 8, true);
    view.setUint32(18, compressed.length, true);
    view.setUint32(22, files[0].data.length, true);
    view.setUint16(26, localName.length, true);
    const centralName = localName;
    const cd = new Uint8Array(46 + centralName.length);
    const cdView = new DataView(cd.buffer);
    cdView.setUint32(0, 0x02014b50, true);
    cdView.setUint16(10, 8, true);
    cdView.setUint32(16, crc, true);
    cdView.setUint32(20, compressed.length, true);
    cdView.setUint32(24, files[0].data.length, true);
    cdView.setUint16(28, centralName.length, true);
    cd.set(centralName, 46);
    const local = new Uint8Array([...header, ...localName, ...compressed]);
    cdView.setUint32(42, 0, true);
    const eocd = new Uint8Array(22);
    const end = new DataView(eocd.buffer);
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, 1, true);
    end.setUint16(10, 1, true);
    end.setUint32(12, cd.length, true);
    end.setUint32(16, local.length, true);
    const zipped = new Uint8Array(local.length + cd.length + eocd.length);
    zipped.set(local, 0);
    zipped.set(cd, local.length);
    zipped.set(eocd, local.length + cd.length);

    const report = await inspectOoxml(zipped);
    expect(report.entries).toEqual([
      expect.objectContaining({ id: 'author', value: 'Jane Doe' }),
    ]);
  });
});

describe('csv metadata', () => {
  it('drops a UTF-8 BOM and an Excel sep line without changing cells', () => {
    const source = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode('sep=,\r\na,b\n1,2\n'),
    ]);
    const before = inspectCsv(source);
    expect(before.removable).toBe(true);
    expect(before.entries.map((row) => row.id)).toEqual(['bom', 'separator']);
    const cleaned = stripCsv(source);
    expect(new TextDecoder().decode(cleaned.bytes)).toBe('a,b\n1,2\n');
    expect(inspectCsv(cleaned.bytes).removable).toBe(false);
  });

  it('leaves a CSV with no marker unchanged', () => {
    const source = new TextEncoder().encode('a,b\n');
    expect(inspectCsv(source).entries).toEqual([]);
    expect(stripCsv(source).changed).toBe(false);
  });
});

describe('cleanedDownloadName', () => {
  it('inserts -cleaned before the extension and drops path pieces', () => {
    expect(cleanedDownloadName('C:\\docs\\report.pdf')).toBe(
      'report-cleaned.pdf'
    );
    expect(cleanedDownloadName('../secret.csv')).toBe('secret-cleaned.csv');
  });
});

describe('unsupported files', () => {
  it('does not pretend a legacy DOC was cleaned', async () => {
    const report = await inspectDocument('old.doc', new Uint8Array([1, 2, 3]));
    expect(report.issue).toBe('unsupported');
    expect(report.removable).toBe(false);
  });
});

describe('input size limit', () => {
  it('accepts exactly 10 MB for inspection and cleanup', async () => {
    expect(MAX_FILE_BYTES).toBe(10_000_000);
    const bytes = new Uint8Array(10_000_000);
    expect(
      (await inspectDocument('boundary.csv', bytes)).issue
    ).toBeUndefined();
    expect((await stripDocument('boundary.csv', bytes)).changed).toBe(false);
  });

  it('rejects files one byte over the limit before any format is processed', async () => {
    const bytes = new Uint8Array(10_000_001);
    for (const extension of [
      'pdf',
      'docx',
      'xlsx',
      'csv',
      'jpg',
      'png',
      'webp',
      'gif',
    ]) {
      expect(
        (await inspectDocument(`oversized.${extension}`, bytes)).issue
      ).toBe('too-large');
      await expect(
        stripDocument(`oversized.${extension}`, bytes)
      ).rejects.toThrow('too-large');
    }
  });
});
