import { useCallback, useState } from 'react';

import { m } from '@/paraglide/messages.js';

export function SorryDemoCarousel({
  sources,
  captions,
}: {
  sources: string[];
  captions: string[];
}) {
  return (
    <div className="trend-showcase-grid trend-showcase-grid--carousel">
      {captions.map((caption, index) => (
        <DemoSlide
          key={`${caption}-${index}`}
          src={sources[index] ?? ''}
          caption={caption}
          closing={index === captions.length - 1}
        />
      ))}
    </div>
  );
}

/**
 * Preload and cache finish before hydration can attach `onLoad`, and the
 * browser does not replay that event. A decoded frame is ready without it.
 * An unfinished frame is not a failure — `naturalWidth` stays 0 until decode.
 */
export function isReadyDemoImage(
  image: { complete: boolean; naturalWidth: number } | null | undefined
): boolean {
  return Boolean(image?.complete && image.naturalWidth > 0);
}

function DemoSlide({
  src,
  caption,
  closing,
}: {
  src: string;
  caption: string;
  closing: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const acceptReady = useCallback(
    (image: HTMLImageElement | null) => {
      if (!isReadyDemoImage(image)) return;
      setFailedSrc((current) => (current === src ? null : current));
    },
    [src]
  );
  // Keep the photo in the first paint and while a slow response is in
  // flight. The upload placeholder is only for a missing file or a failed
  // load; gating the photo on `onLoad` left that placeholder stuck.
  const missing = !src || failedSrc === src;

  return (
    <figure className="trend-showcase-card">
      <div className="trend-showcase-frame sorry-demo-frame">
        {!missing && (
          <img
            ref={acceptReady}
            src={src}
            alt={caption}
            onLoad={(event) => acceptReady(event.currentTarget)}
            onError={() => setFailedSrc(src)}
          />
        )}
        {missing && (
          <span className="sorry-demo-placeholder">
            {m['sorry.demo_placeholder']()}
          </span>
        )}
        {closing && (
          <span className="sorry-burned-caption" data-closing="true">
            {caption}
          </span>
        )}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
