import { Link } from '@/core/i18n/navigation';
import { homeDemoClips } from '@/lib/home-demos';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { Footer } from '@/blocks/footer';
import { Header } from '@/blocks/header';

export function MemeHome() {
  const clips = homeDemoClips(getLocale());
  const styles = [
    [m['meme.style_1_title'](), m['meme.style_1_body']()],
    [m['meme.style_2_title'](), m['meme.style_2_body']()],
    [m['meme.style_3_title'](), m['meme.style_3_body']()],
    [m['meme.style_4_title'](), m['meme.style_4_body']()],
  ];
  const steps = [
    [m['meme.step_1_title'](), m['meme.step_1_body']()],
    [m['meme.step_2_title'](), m['meme.step_2_body']()],
    [m['meme.step_3_title'](), m['meme.step_3_body']()],
  ];
  const faqs = [
    [m['meme.faq_q1'](), m['meme.faq_a1']()],
    [m['meme.faq_q2'](), m['meme.faq_a2']()],
    [m['meme.faq_q3'](), m['meme.faq_a3']()],
    [m['meme.faq_q4'](), m['meme.faq_a4']()],
    [m['meme.faq_q5'](), m['meme.faq_a5']()],
    [m['meme.faq_q6'](), m['meme.faq_a6']()],
  ];

  return (
    <div className="meme-site min-h-screen">
      <Header nav="product" brandMark="aigifmeme" createHref="/packs" />
      <main data-aigifmeme-home="true">
        <section className="meme-hero">
          <p className="meme-kicker">{m['meme.kicker']()}</p>
          <h1>{m['meme.h1']()}</h1>
          <p className="meme-lede">{m['meme.lede']()}</p>
          <div id="create" className="meme-prompt">
            <ol className="meme-steps">
              {steps.map(([title, body], index) => (
                <li key={title}>
                  <span>{index + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="meme-prompt-actions">
              <Link href="/packs" className="meme-cta">
                {m['meme.cta']()}
              </Link>
              <p>{m['meme.prompt_note']()}</p>
            </div>
          </div>
        </section>

        <section id="examples" className="meme-section">
          <h2>{m['meme.examples_title']()}</h2>
          <p>{m['meme.examples_body']()}</p>
          <ul className="meme-stickers">
            {clips.hero.map((clip) => (
              <li key={clip.id}>
                <figure>
                  <img
                    src={clip.src}
                    alt={clip.title}
                    width={320}
                    height={320}
                  />
                  <figcaption>{clip.title}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>

        <section id="styles" className="meme-section">
          <h2>{m['meme.styles_title']()}</h2>
          <p>{m['meme.styles_body']()}</p>
          <ul className="meme-styles">
            {styles.map(([title, body]) => (
              <li key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="how" className="meme-section">
          <h2>{m['meme.how_title']()}</h2>
          <ol className="meme-steps">
            {steps.map(([title, body], index) => (
              <li key={title}>
                <span>{index + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="faq" className="meme-section">
          <h2>{m['meme.faq_title']()}</h2>
          <div className="meme-faq">
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
