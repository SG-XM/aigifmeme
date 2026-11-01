import { useRef, useState } from 'react';

import {
  formatFileSize,
  metadataFileKind,
  type MetadataFileKind,
} from '@/lib/metadata-file';
import { m } from '@/paraglide/messages.js';
import { Footer } from '@/blocks/footer';
import { Header } from '@/blocks/header';
import { SupportWidget } from '@/blocks/support-widget';

const ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.csv,application/pdf,text/csv,application/msword,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function noteFor(kind: MetadataFileKind) {
  if (kind === 'pdf') return m['home.note.pdf']();
  if (kind === 'ooxml') return m['home.note.ooxml']();
  if (kind === 'csv') return m['home.note.csv']();
  if (kind === 'legacy') return m['home.note.legacy']();
  return m['home.note.unknown']();
}

function Dropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<MetadataFileKind>('unknown');
  const [dragOver, setDragOver] = useState(false);
  const [checked, setChecked] = useState(false);

  function take(next: File | undefined) {
    if (!next) return;
    const nextKind = metadataFileKind(next.name);
    setFile(next);
    setKind(nextKind);
    setChecked(false);
  }

  function clear() {
    setFile(null);
    setKind('unknown');
    setChecked(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  const ready = file != null && kind !== 'unknown';

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
          take(event.dataTransfer.files?.[0]);
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
          onChange={(event) => take(event.target.files?.[0])}
        />
        <label htmlFor="metadata-file" className="filemeta-button">
          {m['home.drop.choose']()}
        </label>
        <p className="filemeta-formats">{m['home.drop.formats']()}</p>
      </div>

      {file ? (
        <div className="filemeta-file" aria-live="polite">
          <div>
            <p className="filemeta-file-name">{file.name}</p>
            <p className="filemeta-file-meta">
              {formatFileSize(file.size)}
              {kind !== 'unknown' ? ` · ${kind}` : ''}
            </p>
          </div>
          <button
            type="button"
            className="filemeta-text-button"
            onClick={clear}
          >
            {m['home.drop.clear']()}
          </button>
          <p className="filemeta-note">{noteFor(kind)}</p>
          <p className="filemeta-local">
            {m['home.drop.local']({ name: file.name })}
          </p>
          <button
            type="button"
            className="filemeta-button"
            disabled={!ready}
            onClick={() => setChecked(true)}
          >
            {m['home.drop.remove']()}
          </button>
          {checked && ready ? (
            <p className="filemeta-status">{m['home.drop.preview_only']()}</p>
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
              <strong>DOC / DOCX</strong>
              <span>{m['home.format.word']()}</span>
            </li>
            <li>
              <strong>XLS / XLSX</strong>
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
