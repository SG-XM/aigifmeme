import { Component, useRef, useState, type ReactNode } from 'react';

import { formatFileSize } from '@/lib/metadata-file';
import {
  MAX_FILE_BYTES,
  type DocumentKind,
  type InspectResult,
  type MetadataEntry,
  type MetadataIssue,
} from '@/lib/metadata/types';
import { m } from '@/paraglide/messages.js';
import { Footer } from '@/blocks/footer';
import { Header } from '@/blocks/header';
import { SupportWidget } from '@/blocks/support-widget';

/**
 * pdf-lib's Workers chunk throws while evaluating tslib (`__extends` is
 * undefined). A static import from this module blanks the whole homepage
 * SSR and the marketing cache then stores that shell. Load the strip engine
 * only after the visitor picks a file.
 */
function loadMetadata() {
  return import('@/lib/metadata');
}

const ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.webp,.gif,application/pdf,text/csv,image/jpeg,image/png,image/webp,image/gif,application/msword,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const GROUPS = ['pdf', 'xmp', 'core', 'app', 'custom', 'csv', 'exif'] as const;

const TABS = ['pdf', 'word', 'excel', 'csv', 'image'] as const;
type FormatTab = (typeof TABS)[number];

function noteFor(kind: DocumentKind) {
  if (kind === 'pdf') return m['home.note.pdf']();
  if (kind === 'ooxml') return m['home.note.ooxml']();
  if (kind === 'csv') return m['home.note.csv']();
  if (kind === 'legacy') return m['home.note.legacy']();
  if (kind === 'image') return m['home.note.image']();
  if (kind === 'video') return m['home.note.video']();
  return m['home.note.unknown']();
}

function tabLabel(tab: FormatTab) {
  if (tab === 'pdf') return m['home.tab.pdf']();
  if (tab === 'word') return m['home.tab.word']();
  if (tab === 'excel') return m['home.tab.excel']();
  if (tab === 'csv') return m['home.tab.csv']();
  return m['home.tab.image']();
}

function tabHint(tab: FormatTab) {
  if (tab === 'pdf') return m['home.tab.pdf_hint']();
  if (tab === 'word') return m['home.tab.word_hint']();
  if (tab === 'excel') return m['home.tab.excel_hint']();
  if (tab === 'csv') return m['home.tab.csv_hint']();
  return m['home.tab.image_hint']();
}

function groupTitle(group: (typeof GROUPS)[number]) {
  if (group === 'pdf') return m['home.group.pdf']();
  if (group === 'xmp') return m['home.group.xmp']();
  if (group === 'core') return m['home.group.core']();
  if (group === 'app') return m['home.group.app']();
  if (group === 'custom') return m['home.group.custom']();
  if (group === 'exif') return m['home.group.exif']();
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
  if (row.id === 'make') return m['home.field.make']();
  if (row.id === 'model') return m['home.field.model']();
  if (row.id === 'software') return m['home.field.software']();
  if (row.id === 'artist') return m['home.field.artist']();
  if (row.id === 'copyright') return m['home.field.copyright']();
  if (row.id === 'datetime' || row.id === 'created')
    return m['home.field.created']();
  if (row.id === 'description') return m['home.field.description']();
  if (row.id === 'latitude' || row.id === 'longitude' || row.id === 'gps') {
    return m['home.field.gps']();
  }
  if (row.id === 'credentials') return m['home.field.credentials']();
  if (row.id === 'comment') return m['home.field.comment']();
  return row.label;
}

function issueText(issue: MetadataIssue) {
  if (issue === 'encrypted') return m['home.drop.error_encrypted']();
  if (issue === 'too-large') return m['home.drop.error_too_large']();
  if (issue === 'unsupported') return m['home.drop.unsupported']();
  if (issue === 'strip-failed') return m['home.drop.error_strip']();
  if (issue === 'video') return m['home.drop.error_video']();
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
  const [tab, setTab] = useState<FormatTab>('pdf');

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
    const { inspectDocument } = await loadMetadata();
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
      const {
        inspectDocument,
        stripDocument,
        cleanedDownloadName,
        downloadMime,
      } = await loadMetadata();
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
        className="filemeta-tabs"
        role="tablist"
        aria-label={m['home.tabs_label']()}
      >
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
          >
            {tabLabel(item)}
          </button>
        ))}
      </div>
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
        <p>{tabHint(tab)}</p>
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
                  const bytes = bytesRef.current;
                  const name = file.name.split(/[/\\]/).pop() || 'file';
                  void loadMetadata().then(({ downloadMime }) => {
                    saveFile(name, bytes, downloadMime(name));
                  });
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
                onClick={() => {
                  const filename = phase.filename;
                  const bytes = phase.bytes;
                  const name = file.name;
                  void loadMetadata().then(({ downloadMime }) => {
                    saveFile(filename, bytes, downloadMime(name));
                  });
                }}
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
  ['home.faq_q8', 'home.faq_a8'],
  ['home.faq_q9', 'home.faq_a9'],
  ['home.faq_q10', 'home.faq_a10'],
  ['home.faq_q11', 'home.faq_a11'],
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
  if (key === 'home.faq_a7') return m['home.faq_a7']();
  if (key === 'home.faq_q8') return m['home.faq_q8']();
  if (key === 'home.faq_a8') return m['home.faq_a8']();
  if (key === 'home.faq_q9') return m['home.faq_q9']();
  if (key === 'home.faq_a9') return m['home.faq_a9']();
  if (key === 'home.faq_q10') return m['home.faq_q10']();
  if (key === 'home.faq_a10') return m['home.faq_a10']();
  if (key === 'home.faq_q11') return m['home.faq_q11']();
  return m['home.faq_a11']();
}

function DropzoneShell() {
  return (
    <div id="wipe" className="filemeta-drop">
      <div className="filemeta-drop-well">
        <p className="filemeta-kicker">{m['home.drop.kicker']()}</p>
        <h2>{m['home.drop.title']()}</h2>
        <p>{m['home.drop.hint']()}</p>
        <p className="filemeta-formats">{m['home.drop.formats']()}</p>
      </div>
    </div>
  );
}

class ToolBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <DropzoneShell />;
    return this.props.children;
  }
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
          <ul className="filemeta-promises">
            <li>{m['home.promise.screen']()}</li>
            <li>{m['home.promise.device']()}</li>
          </ul>
          <ToolBoundary>
            <Dropzone />
          </ToolBoundary>
        </section>

        <section id="check" className="filemeta-section">
          <h2>{m['home.check_title']()}</h2>
          <p>{m['home.check_p1']()}</p>
          <p>{m['home.check_p2']()}</p>
          <p>{m['home.check_p3']()}</p>
        </section>

        <section id="formats" className="filemeta-section">
          <h2>{m['home.formats_title']()}</h2>
          <p>{m['home.formats_body']()}</p>
          <p>{m['home.formats_video']()}</p>
          <ul className="filemeta-format-grid">
            <li>
              <strong>PDF</strong>
              <span>{m['home.format.pdf']()}</span>
            </li>
            <li>
              <strong>JPEG</strong>
              <span>{m['home.format.jpeg']()}</span>
            </li>
            <li>
              <strong>PNG</strong>
              <span>{m['home.format.png']()}</span>
            </li>
            <li>
              <strong>WebP</strong>
              <span>{m['home.format.webp']()}</span>
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
          <p>{m['home.removes_intro']()}</p>
          <ul className="filemeta-removes">
            <li>{m['home.removes_author']()}</li>
            <li>{m['home.removes_company']()}</li>
            <li>{m['home.removes_dates']()}</li>
            <li>{m['home.removes_office']()}</li>
            <li>{m['home.removes_camera']()}</li>
            <li>{m['home.removes_gps']()}</li>
          </ul>
          <div className="filemeta-privacy">
            <h2>{m['home.privacy_title']()}</h2>
            <p>{m['home.privacy_body']()}</p>
            <p>{m['home.privacy_account']()}</p>
          </div>
        </section>

        <section className="filemeta-section">
          <h2>{m['home.leaves_title']()}</h2>
          <p>{m['home.leaves_p1']()}</p>
          <p>{m['home.leaves_p2']()}</p>
        </section>

        <section className="filemeta-section">
          <h2>{m['home.uses_title']()}</h2>
          <p>{m['home.uses_p1']()}</p>
          <p>{m['home.uses_p2']()}</p>
          <p>{m['home.uses_p3']()}</p>
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
