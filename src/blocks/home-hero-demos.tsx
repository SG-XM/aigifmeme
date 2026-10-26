import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

import { m } from '@/paraglide/messages.js';

type HeroClip = {
  id?: string;
  src: string;
  poster?: string;
  title: string;
};

/**
 * Homepage examples stay 16:9.
 * Phones swipe one full-width card. Wider screens show a 2×2 grid.
 * Clips autoplay muted. Sound starts only after a tap on that card.
 */
export function HomeHeroDemos({ clips }: { clips: HeroClip[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [soundId, setSoundId] = useState<string | null>(null);
  const active = clips[index];

  useEffect(() => {
    const root = trackRef.current;
    if (!root) return;
    const slides = [...root.querySelectorAll<HTMLElement>('[data-index]')];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(
            (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.6
          )
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const next = Number((visible.target as HTMLElement).dataset.index);
        if (!Number.isNaN(next)) setIndex(next);
      },
      { root, threshold: [0.6, 0.85] }
    );
    for (const slide of slides) observer.observe(slide);
    return () => observer.disconnect();
  }, [clips.length]);

  function show(next: number) {
    const root = trackRef.current;
    const slide = root?.querySelector<HTMLElement>(`[data-index="${next}"]`);
    slide?.scrollIntoView({
      behavior: 'smooth',
      inline: 'start',
      block: 'nearest',
    });
    setIndex(next);
  }

  return (
    <section className="home-hero-demos" aria-label={m['home.hero.examples']()}>
      <div className="home-hero-track" ref={trackRef}>
        {clips.map((clip, clipIndex) => {
          const id = clip.id ?? clip.src;
          return (
            <figure key={id} className="home-hero-slide" data-index={clipIndex}>
              <HeroFrame
                clip={clip}
                audible={soundId === id}
                prioritize={clipIndex === 0}
                onAudible={(on) => setSoundId(on ? id : null)}
              />
              <figcaption>{clip.title}</figcaption>
            </figure>
          );
        })}
      </div>
      <p className="home-hero-live" aria-live="polite">
        {active?.title}
      </p>
      <div className="home-hero-dots" role="tablist">
        {clips.map((clip, clipIndex) => {
          const id = clip.id ?? clip.src;
          const selected = clipIndex === index;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={clip.title}
              onClick={() => show(clipIndex)}
            />
          );
        })}
      </div>
    </section>
  );
}

function HeroFrame({
  clip,
  audible,
  prioritize,
  onAudible,
}: {
  clip: HeroClip;
  audible: boolean;
  prioritize: boolean;
  onAudible: (on: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(prioritize);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || ready) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setReady(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px', threshold: 0.01 }
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [ready]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const playback = new IntersectionObserver(
      ([entry]) => {
        const visible =
          !!entry?.isIntersecting && entry.intersectionRatio >= 0.55;
        if (visible && !motion.matches)
          void video.play().catch(() => undefined);
        else if (!visible) {
          video.pause();
          if (!audible) video.muted = true;
        }
      },
      { threshold: [0.55] }
    );
    playback.observe(video);
    video.muted = !audible;
    if (audible) void video.play().catch(() => undefined);
    return () => playback.disconnect();
  }, [ready, audible]);

  const soundLabel = audible
    ? m['common.video.mute']()
    : m['common.video.unmute']();

  return (
    <button
      ref={frameRef}
      type="button"
      className="home-hero-hit"
      aria-pressed={audible}
      aria-label={`${clip.title}. ${soundLabel}`}
      onClick={() => {
        const video = videoRef.current;
        const next = !audible;
        if (video) {
          video.muted = !next;
          if (next) void video.play().catch(() => undefined);
        }
        onAudible(next);
      }}
    >
      <span className="home-hero-frame">
        {clip.poster ? (
          <img
            src={clip.poster}
            alt=""
            aria-hidden
            className="home-hero-blur"
          />
        ) : null}
        <video
          ref={videoRef}
          className="home-hero-video"
          src={ready ? clip.src : undefined}
          poster={clip.poster}
          muted={!audible}
          loop
          playsInline
          preload={ready ? 'metadata' : 'none'}
          disableRemotePlayback
        />
        <span className="home-hero-sound" aria-hidden="true">
          {audible ? <Volume2 /> : <VolumeX />}
        </span>
      </span>
    </button>
  );
}
