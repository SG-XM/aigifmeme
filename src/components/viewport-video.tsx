import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

import { m } from '@/paraglide/messages.js';

/**
 * Loads and plays a muted looping preview only while it is near the viewport.
 * This keeps the masonry gallery lively without downloading every clip at once.
 */
export function ViewportVideo({
  src,
  className,
  controls = false,
  showMuteToggle = true,
  compactMuteToggle = false,
  poster,
  ariaLabel,
  rootMargin = '240px',
  deferPoster = false,
}: {
  src: string;
  className?: string;
  controls?: boolean;
  showMuteToggle?: boolean;
  compactMuteToggle?: boolean;
  poster?: string;
  ariaLabel?: string;
  /** How early to start the download. Homepage passes `0px` so off-screen clips wait. */
  rootMargin?: string;
  /** Skip the poster until the clip is near the viewport. */
  deferPoster?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVisibleRef = useRef(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const motionPreference = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    );
    const loadingObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldLoad(true);
          loadingObserver.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 }
    );

    const playbackObserver = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = !!entry?.isIntersecting;
        if (isVisibleRef.current && !motionPreference.matches) {
          void video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.01 }
    );
    const onMotionChange = () => {
      if (motionPreference.matches) video.pause();
      else if (isVisibleRef.current) void video.play().catch(() => {});
    };
    loadingObserver.observe(video);
    playbackObserver.observe(video);
    motionPreference.addEventListener('change', onMotionChange);
    return () => {
      loadingObserver.disconnect();
      playbackObserver.disconnect();
      motionPreference.removeEventListener('change', onMotionChange);
      video.pause();
    };
  }, [rootMargin]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoad) return;
    // Changing the src already loads the resource. Avoid explicit load() calls:
    // they reset playback, and can disrupt a viewer who enabled sound.
    if (
      isVisibleRef.current &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      void video.play().catch(() => {});
    }
  }, [shouldLoad, src]);

  return (
    <div className="group/video relative block w-full">
      <video
        ref={videoRef}
        src={shouldLoad ? src : undefined}
        poster={deferPoster && !shouldLoad ? undefined : poster}
        aria-label={ariaLabel}
        loop
        controls={controls}
        muted={isMuted}
        onVolumeChange={(event) => setIsMuted(event.currentTarget.muted)}
        playsInline
        preload="none"
        className={className}
      />
      {showMuteToggle && (
        <button
          type="button"
          aria-label={
            isMuted ? m['common.video.unmute']() : m['common.video.mute']()
          }
          aria-pressed={!isMuted}
          onClick={() => setIsMuted((muted) => !muted)}
          className={`absolute z-10 inline-flex min-h-11 items-center gap-2 rounded-full bg-black/70 text-xs font-medium text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/85 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none ${compactMuteToggle ? 'top-1 right-1 size-11 justify-center p-0 sm:top-3 sm:right-3 sm:w-auto sm:px-3' : 'top-3 right-3 px-3'}`}
        >
          {isMuted ? (
            <VolumeX aria-hidden="true" className="size-4" />
          ) : (
            <Volume2 aria-hidden="true" className="size-4" />
          )}
          <span
            className={compactMuteToggle ? 'sr-only sm:not-sr-only' : undefined}
          >
            {isMuted ? m['common.video.unmute']() : m['common.video.mute']()}
          </span>
        </button>
      )}
    </div>
  );
}
