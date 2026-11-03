import { Eraser, FileCheck2, FileSearch } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import {
  PDF_METADATA_UPDATED_AT,
  pdfMetadataCopy,
} from '@/lib/pdf-metadata-content';
import { m } from '@/paraglide/messages.js';
import { Footer } from '@/blocks/footer';
import { Header } from '@/blocks/header';
import { PdfMetadataTool } from '@/blocks/metadata-remover-home';
import { SupportWidget } from '@/blocks/support-widget';

export const PDF_PROPERTIES_SOURCE =
  'https://helpx.adobe.com/acrobat/desktop/edit-documents/edit-pdf-properties/pdf-properties.html';
export const PDF_SANITIZE_SOURCE =
  'https://helpx.adobe.com/acrobat/desktop/protect-documents/redact-pdfs/sanitize.html';

export function PdfMetadataRemover({ siteName }: { siteName: string }) {
  const c = pdfMetadataCopy();
  const steps = [
    { title: c.step1_title, body: c.step1_body, icon: FileSearch },
    { title: c.step2_title, body: c.step2_body, icon: Eraser },
    { title: c.step3_title, body: c.step3_body, icon: FileCheck2 },
  ];
  const fields = [
    [c.row1_field, c.row1_body],
    [c.row2_field, c.row2_body],
    [c.row3_field, c.row3_body],
    [c.row4_field, c.row4_body],
  ];
  const faqs = [
    [c.faq_q1, c.faq_a1],
    [c.faq_q2, c.faq_a2],
    [c.faq_q3, c.faq_a3],
    [c.faq_q4, c.faq_a4],
    [c.faq_q5, c.faq_a5],
    [c.faq_q6, c.faq_a6],
    [c.faq_q7, c.faq_a7],
    [c.faq_q8, c.faq_a8],
    [c.faq_q9, c.faq_a9],
    [c.faq_q10, c.faq_a10],
    [c.faq_q11, c.faq_a11],
    [c.faq_q12, c.faq_a12],
  ];
  return (
    <div className="trend-site filemeta-site pdf-page min-h-screen">
      <Header nav="product" brandMark="filemeta" createHref="#wipe" />
      <main data-pdf-metadata-page>
        <div className="pdf-intro">
          <nav className="pdf-breadcrumb" aria-label={c.breadcrumb_home}>
            <Link href="/">{c.breadcrumb_home}</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">PDF</span>
          </nav>
          <div className="pdf-hero-grid">
            <div>
              <h1>{c.title}</h1>
              <p className="pdf-lead">{c.intro}</p>
              <p className="pdf-facts">{c.facts}</p>
            </div>
            <img
              className="pdf-hero-art"
              src="/images/pdf-metadata/pdf-properties-eraser.webp"
              srcSet="/images/pdf-metadata/pdf-properties-eraser-480.webp 480w, /images/pdf-metadata/pdf-properties-eraser.webp 960w"
              sizes="(max-width: 680px) 280px, 400px"
              width={960}
              height={640}
              alt={c.hero_alt}
              fetchPriority="high"
              decoding="async"
            />
          </div>
          <PdfMetadataTool />
        </div>

        <nav className="pdf-contents" aria-label={c.contents_label}>
          <a href="#pdf-how">{c.how_title}</a>
          <a href="#pdf-scope">{c.scope_title}</a>
          <a href="#pdf-verify">{c.verify_title}</a>
          <a href="#pdf-faq">FAQ</a>
        </nav>

        <section id="pdf-how" className="filemeta-section pdf-how">
          <h2>{c.how_title}</h2>
          <ol className="pdf-process">
            {steps.map(({ title, body, icon: Icon }, i) => (
              <li key={title}>
                <div className="pdf-process-symbol" aria-hidden="true">
                  <Icon size={30} strokeWidth={1.5} />
                </div>
                <div>
                  <h3>
                    <span>{i + 1}.</span> {title}
                  </h3>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="pdf-scope" className="filemeta-section pdf-scope">
          <h2>{c.scope_title}</h2>
          <p>{c.scope_intro}</p>
          <div
            className="filemeta-table-scroll"
            tabIndex={0}
            role="region"
            aria-label={c.table_caption}
          >
            <table className="filemeta-table">
              <caption>{c.table_caption}</caption>
              <thead>
                <tr>
                  <th scope="col">{c.table_field}</th>
                  <th scope="col">{c.table_action}</th>
                </tr>
              </thead>
              <tbody>
                {fields.map(([field, body]) => (
                  <tr key={field}>
                    <th scope="row">{field}</th>
                    <td>{body}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="pdf-scope-note">
            <h3>{c.limits_title}</h3>
            <p>{c.limits_body}</p>
            <a
              href={PDF_SANITIZE_SOURCE}
              target="_blank"
              rel="noopener noreferrer"
            >
              {c.limits_link}
            </a>
          </aside>
        </section>

        <section id="pdf-verify" className="filemeta-section pdf-verify">
          <h2>{c.verify_title}</h2>
          <p>{c.verify_body}</p>
          <p className="pdf-verify-note">{c.verify_note}</p>
        </section>

        <section className="filemeta-section pdf-uses">
          <h2>{c.why_title}</h2>
          <p>{c.why_body}</p>
        </section>

        <section id="pdf-faq" className="filemeta-section filemeta-faq">
          <h2>{c.faq_title}</h2>
          {faqs.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>

        <section className="filemeta-section pdf-related">
          <h2>{c.related_title}</h2>
          <p>{c.related_body}</p>
          <Link href="/" className="pdf-inline-link">
            {c.related_cta}
            <span aria-hidden="true"> →</span>
          </Link>
        </section>

        <section className="filemeta-section pdf-provenance">
          <h2>{c.sources_title}</h2>
          <ul>
            <li>
              <a
                href={PDF_PROPERTIES_SOURCE}
                target="_blank"
                rel="noopener noreferrer"
              >
                {c.source_properties}
              </a>
            </li>
            <li>
              <a
                href={PDF_SANITIZE_SOURCE}
                target="_blank"
                rel="noopener noreferrer"
              >
                {c.source_sanitize}
              </a>
            </li>
          </ul>
          <p>
            {m['pdf.team']({ brand: siteName })} ·{' '}
            <time dateTime={PDF_METADATA_UPDATED_AT}>
              {m['pdf.updated']({ date: PDF_METADATA_UPDATED_AT })}
            </time>
          </p>
          <p>
            <Link href="/about">{m['home.about_link']()}</Link>{' '}
            <span aria-hidden="true"> / </span>{' '}
            <Link href="/contact">{m['home.contact_link']()}</Link>
          </p>
        </section>
      </main>
      <Footer />
      <SupportWidget />
    </div>
  );
}
