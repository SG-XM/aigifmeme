import { useRef, useState } from 'react';

import {
  cleanedDownloadName,
  downloadMime,
  inspectDocument,
  MAX_FILE_BYTES,
  stripDocument,
  type DocumentKind,
  type InspectResult,
  type MetadataEntry,
  type MetadataIssue,
} from '@/lib/metadata';
import { formatFileSize } from '@/lib/metadata-file';
import { m } from '@/paraglide/messages.js';
import { Footer } from '@/blocks/footer';
import { Header } from '@/blocks/header';
import { SupportWidget } from '@/blocks/support-widget';

const ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.csv,application/pdf,text/csv,application/msword,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const GROUPS = ['pdf', 'xmp', 'core', 'app', 'custom', 'csv'] as const;

function noteFor(kind: DocumentKind) {
  if (kind === 'pdf') return m['home.note.pdf']();
  if (kind === 'ooxml') return m['home.note.ooxml']();
  if (kind === 'csv') return m['home.note.csv']();
  if (kind === 'legacy') return m['home.note.legacy']();
  return m['home.note.unknown']();
}

function groupTitle(group: (typeof GROUPS)[number]) {
  if (group === 'pdf') return m['home.group.pdf']();
  if (group === 'xmp') return m['home.group.xmp']();
  if (group === 'core') return m['home.group.core']();
  if (group === 'app') return m['home.group.app']();
  if (group === 'custom') return m['home.group.custom']();
  return m['home.group.csv']();
}

function fieldLabel(row: MetadataEntry) {
  if (row.id === 'title') return m['home.field.title']();
  if (row.id === 'author') return m['home.field.author']();
  if (row.id === 'subject') return m['home.field.subject']();
  if (row.id === 'keywords') return m['home.field.keywords']();
  if (row.id === 'creator') return m['home.field.creator']();
  if (row.id === 'producer') return m['home.field.producer']();
  if (row.id === 'created') return m['home.field.created']();
  if (row.id === 'modified') return m['home.field.modified']();
  if (row.id === 'company') return m['home.field.company']();
  if (row.id === 'manager') return m['home.field.manager']();
  if (row.id === 'application') return m['home.field.application']();
  if (row.id === 'last-modified-by') return m['home.field.last_modified_by']();
  if (row.id === 'revision') return m['home.field.revision']();
  if (row.id === 'category') return m['home.field.category']();
  if (row.id === 'template') return m['home.field.template']();
  if (row.id === 'bom') return m['home.field.bom']();
  if (row.id === 'separator') return m['home.field.separator']();
  return row.label;
}

function issueText(issue: MetadataIssue) {
  if (issue === 'encrypted') return m['home.drop.error_encrypted']();
  if (issue === 'too-large') return m['home.drop.error_too_large']();
  if (issue === 'unsupported') return m['home.drop.unsupported']();
  if (issue === 'strip-failed') return m['home.drop.error_strip']();
  return m['home.drop.error_read']();
}

function saveFile(filename: string, bytes: Uint8Array, mime: string) {
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function FieldList({ entries }: { entries: MetadataEntry[] }) {
  const groups = GROUPS.filter((group) =>
    entries.some((row) => row.group === group)
  );
  return (
    <div className="filemeta-fields">
      {groups.map((group) => (
        <section key={group} className="filemeta-group">
          <h3>{groupTitle(group)}</h3>
          <dl>
            {entries
              .filter((row) => row.group === group)
              .map((row, index) => (
                <div
                  key={`${row.group}-${row.id}-${index}`}
                  className="filemeta-field"
                >
                  <dt>{fieldLabel(row)}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

type Phase =
  | { name: 'reading' }
  | { name: 'ready'; report: InspectResult }
  | { name: 'stripping'; report: InspectResult }
  | {
      name: 'done';
      before: InspectResult;
      after: InspectResult;
      filename: string;
      bytes: Uint8Array;
    }
  | { name: 'error'; issue: MetadataIssue };

function Dropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const bytesRef = useRef<Uint8Array | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);

  async function take(next: File | undefined) {
    if (!next) return;
    const id = ++request.current;
    setFile(next);
    bytesRef.current = null;
    if (next.size > MAX_FILE_BYTES) {
      setPhase({ name: 'error', issue: 'too-large' });
      return;
    }
    setPhase({ name: 'reading' });
    const bytes = new Uint8Array(await next.arrayBuffer());
    if (request.current !== id) return;
    bytesRef.current = bytes;
    const report = await inspectDocument(next.name, bytes);
    if (request.current !== id) return;
    setPhase(
      report.issue
        ? { name: 'error', issue: report.issue }
        : { name: 'ready', report }
    );
  }

  function clear() {
    request.current += 1;
    setFile(null);
    setPhase(null);
    bytesRef.current = null;
    if (inputRef.current) inputRef.current.value = '';
  }

  async function remove() {
    if (!file || phase?.name !== 'ready' || !bytesRef.current) return;
    const before = phase.report;
    const id = request.current;
    setPhase({ name: 'stripping', report: before });
    try {
      const cleaned = await stripDocument(file.name, bytesRef.current);
      const after = await inspectDocument(
        file.name,
        cleaned.changed ? cleaned.bytes : bytesRef.current
      );
      if (request.current !== id) return;
      const filename = cleanedDownloadName(file.name);
      const bytes = cleaned.changed ? cleaned.bytes : bytesRef.current;
      saveFile(filename, bytes, downloadMime(file.name));
      setPhase({ name: 'done', before, after, filename, bytes });
    } catch {
      if (request.current !== id) return;
      setPhase({ name: 'error', issue: 'strip-failed' });
    }
  }

  const report =
    phase?.name === 'ready' || phase?.name === 'stripping'
      ? phase.report
      : null;
  const busy = phase?.name === 'reading' || phase?.name === 'stripping';

  return (
    <div id="wipe" className="filemeta-drop">
      <div
        className={
          dragOver ? 'filemeta-drop-well is-over' : 'filemeta-drop-well'
        }
        onDragEnter={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void take(event.dataTransfer.files?.[0]);
        }}
      >
        <p className="filemeta-kicker">{m['home.drop.kicker']()}</p>
        <h2>{m['home.drop.title']()}</h2>
        <p>{m['home.drop.hint']()}</p>
        <input
          ref={inputRef}
          id="metadata-file"
          className="sr-only"
          type="file"
          accept={ACCEPT}
          onChange={(event) => void take(event.target.files?.[0])}
        />
        <label htmlFor="metadata-file" className="filemeta-button">
          {m['home.drop.choose']()}
        </label>
        <p className="filemeta-formats">{m['home.drop.formats']()}</p>
      </div>

      {file ? (
        <div className="filemeta-file" aria-live="polite">
          <div className="filemeta-file-head">
            <div>
              <p className="filemeta-file-name">{file.name}</p>
              <p className="filemeta-file-meta">{formatFileSize(file.size)}</p>
            </div>
            <button
              type="button"
              className="filemeta-text-button"
              onClick={clear}
            >
              {m['home.drop.clear']()}
            </button>
          </div>
          <p className="filemeta-local">
            {m['home.drop.local']({ name: file.name })}
          </p>
          {phase?.name === 'reading' ? (
            <p className="filemeta-status">{m['home.drop.reading']()}</p>
          ) : null}
          {phase?.name === 'error' ? (
            <p className="filemeta-error">{issueText(phase.issue)}</p>
          ) : null}
          {report && !report.issue ? (
            <>
              <p className="filemeta-note">{noteFor(report.kind)}</p>
              {report.entries.length > 0 ? (
                <>
                  <h3 className="filemeta-found">
                    {m['home.drop.found_title']()}
                  </h3>
                  <FieldList entries={report.entries} />
                </>
              ) : (
                <div className="filemeta-empty">
                  <strong>{m['home.drop.empty_title']()}</strong>
                  <p>{m['home.drop.empty_body']()}</p>
                </div>
              )}
            </>
          ) : null}
          {phase?.name === 'done' ? (
            <div className="filemeta-compare">
              <section>
                <h3>{m['home.compare.before']()}</h3>
                {phase.before.entries.length > 0 ? (
                  <FieldList entries={phase.before.entries} />
                ) : (
                  <p>{m['home.drop.empty_title']()}</p>
                )}
              </section>
              <section>
                <h3>{m['home.compare.after']()}</h3>
                {phase.before.entries.length === 0 ? (
                  <p>{m['home.drop.empty_title']()}</p>
                ) : (
                  <dl className="filemeta-fields">
                    {phase.before.entries.map((row, index) => {
                      const still = phase.after.entries.some(
                        (item) =>
                          item.group === row.group &&
                          item.id === row.id &&
                          item.value === row.value
                      );
                      return (
                        <div
                          key={`${row.group}-${row.id}-${index}`}
                          className="filemeta-field"
                        >
                          <dt>{fieldLabel(row)}</dt>
                          <dd
                            className={still ? undefined : 'filemeta-removed'}
                          >
                            {still ? row.value : m['home.compare.removed']()}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                )}
              </section>
            </div>
          ) : null}
          <div className="filemeta-actions">
            {phase?.name === 'ready' && phase.report.removable ? (
              <button
                type="button"
                className="filemeta-button"
                onClick={() => void remove()}
              >
                {m['home.drop.remove']()}
              </button>
            ) : null}
            {phase?.name === 'ready' && !phase.report.removable ? (
              <button
                type="button"
                className="filemeta-button"
                onClick={() => {
                  if (!bytesRef.current || !file) return;
                  saveFile(
                    file.name.split(/[/\\]/).pop() || 'file',
                    bytesRef.current,
                    downloadMime(file.name)
                  );
                }}
              >
                {m['home.drop.download_original']()}
              </button>
            ) : null}
            {phase?.name === 'stripping' ? (
              <button type="button" className="filemeta-button" disabled>
                {m['home.drop.removing']()}
              </button>
            ) : null}
            {phase?.name === 'done' ? (
              <button
                type="button"
                className="filemeta-button"
                onClick={() =>
                  saveFile(phase.filename, phase.bytes, downloadMime(file.name))
                }
              >
                {m['home.drop.download']()}
              </button>
            ) : null}
          </div>
          {phase?.name === 'done' ? (
            <p className="filemeta-status">{m['home.drop.removed']()}</p>
          ) : null}
          {busy ? (
            <span className="sr-only">{m['home.drop.reading']()}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const FAQ = [
  ['home.faq_q1', 'home.faq_a1'],
  ['home.faq_q2', 'home.faq_a2'],
  ['home.faq_q3', 'home.faq_a3'],
  ['home.faq_q4', 'home.faq_a4'],
  ['home.faq_q5', 'home.faq_a5'],
  ['home.faq_q6', 'home.faq_a6'],
  ['home.faq_q7', 'home.faq_a7'],
] as const;

function faqText(key: (typeof FAQ)[number][0] | (typeof FAQ)[number][1]) {
  if (key === 'home.faq_q1') return m['home.faq_q1']();
  if (key === 'home.faq_a1') return m['home.faq_a1']();
  if (key === 'home.faq_q2') return m['home.faq_q2']();
  if (key === 'home.faq_a2') return m['home.faq_a2']();
  if (key === 'home.faq_q3') return m['home.faq_q3']();
  if (key === 'home.faq_a3') return m['home.faq_a3']();
  if (key === 'home.faq_q4') return m['home.faq_q4']();
  if (key === 'home.faq_a4') return m['home.faq_a4']();
  if (key === 'home.faq_q5') return m['home.faq_q5']();
  if (key === 'home.faq_a5') return m['home.faq_a5']();
  if (key === 'home.faq_q6') return m['home.faq_q6']();
  if (key === 'home.faq_a6') return m['home.faq_a6']();
  if (key === 'home.faq_q7') return m['home.faq_q7']();
  return m['home.faq_a7']();
}

export function MetadataRemoverHome() {
  return (
    <div className="trend-site filemeta-site min-h-screen">
      <Header nav="product" brandMark="filemeta" />
      <main>
        <section className="filemeta-hero">
          <p className="filemeta-kicker">{m['home.eyebrow']()}</p>
          <h1>{m['home.title']()}</h1>
          <p className="filemeta-lead">{m['home.description']()}</p>
          <Dropzone />
        </section>

        <section id="formats" className="filemeta-section">
          <h2>{m['home.formats_title']()}</h2>
          <p>{m['home.formats_body']()}</p>
          <ul className="filemeta-format-grid">
            <li>
              <strong>PDF</strong>
              <span>{m['home.format.pdf']()}</span>
            </li>
            <li>
              <strong>DOCX</strong>
              <span>{m['home.format.word']()}</span>
            </li>
            <li>
              <strong>XLSX</strong>
              <span>{m['home.format.excel']()}</span>
            </li>
            <li>
              <strong>CSV</strong>
              <span>{m['home.format.csv']()}</span>
            </li>
          </ul>
        </section>

        <section id="how" className="filemeta-section">
          <h2>{m['home.steps_title']()}</h2>
          <p>{m['home.steps_description']()}</p>
          <ol className="filemeta-steps">
            <li>
              <strong>{m['home.step_upload_title']()}</strong>
              <span>{m['home.step_upload_body']()}</span>
            </li>
            <li>
              <strong>{m['home.step_generate_title']()}</strong>
              <span>{m['home.step_generate_body']()}</span>
            </li>
            <li>
              <strong>{m['home.step_download_title']()}</strong>
              <span>{m['home.step_download_body']()}</span>
            </li>
          </ol>
        </section>

        <section className="filemeta-section">
          <h2>{m['home.removes_title']()}</h2>
          <ul className="filemeta-removes">
            <li>{m['home.removes_author']()}</li>
            <li>{m['home.removes_company']()}</li>
            <li>{m['home.removes_dates']()}</li>
            <li>{m['home.removes_office']()}</li>
          </ul>
          <div className="filemeta-privacy">
            <h2>{m['home.privacy_title']()}</h2>
            <p>{m['home.privacy_body']()}</p>
          </div>
        </section>

        <section id="faq" className="filemeta-section">
          <h2>{m['home.faq_title']()}</h2>
          <div className="filemeta-faq">
            {FAQ.map(([question, answer]) => (
              <details key={question}>
                <summary>{faqText(question)}</summary>
                <p>{faqText(answer)}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <Footer />
      <SupportWidget />
    </div>
  );
}
