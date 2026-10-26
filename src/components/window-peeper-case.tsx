import { useEffect, useRef, useState } from 'react';

import { ViewportVideo } from '@/components/viewport-video';
import { wipePercent } from '@/components/window-peeper-wipe';

type Drag = {
  id: number;
  startX: number;
  startY: number;
  fromSash: boolean;
  active: boolean;
};

/**
 * One real Window Peeper case. The still wipes into the silent result until
 * the visitor drags. After that drag, the wipe stays where they left it.
 * Reduced motion keeps the two frames side by side.
 */
export function WindowPeeperCase({
  inputSrc,
  videoSrc,
  poster,
  inputLabel,
  resultLabel,
  caption,
}: {
  inputSrc: string;
  videoSrc: string;
  poster?: string;
  inputLabel: string;
  resultLabel: string;
  caption: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [reduced, setReduced] = useState(false);
  const manual = percent != null && !reduced;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  function capturePointer(event: React.PointerEvent<HTMLDivElement>) {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The drag still tracks while the pointer remains over the stage.
    }
  }

  function percentFromClientX(clientX: number) {
    const stage = stageRef.current;
    if (!stage) return 0;
    const rect = stage.getBoundingClientRect();
    return wipePercent(clientX, rect.left, rect.width);
  }

  function shownPercent() {
    if (percent != null) return percent;
    const stage = stageRef.current;
    const result = stage?.querySelector<HTMLElement>('.peeper-case-result');
    if (!stage || !result) return 0;
    const width = stage.getBoundingClientRect().width;
    return wipePercent(
      stage.getBoundingClientRect().left + result.getBoundingClientRect().width,
      stage.getBoundingClientRect().left,
      width
    );
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (reduced || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('button, a, input, textarea')) return;
    if (target instanceof HTMLVideoElement) {
      const rect = target.getBoundingClientRect();
      if (event.clientY > rect.bottom - 44) return;
    }
    const fromSash = Boolean(target.closest('.peeper-case-sash'));
    dragRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      fromSash,
      active: false,
    };
    if (fromSash) capturePointer(event);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (reduced || !drag || drag.id !== event.pointerId) return;
    if (!drag.active) {
      const dx = Math.abs(event.clientX - drag.startX);
      const dy = Math.abs(event.clientY - drag.startY);
      const threshold = drag.fromSash ? 3 : 8;
      if (dx < threshold && dy < threshold) return;
      if (!drag.fromSash && dy > dx) {
        dragRef.current = null;
        return;
      }
      drag.active = true;
      setDragging(true);
      if (!drag.fromSash) capturePointer(event);
    }
    setPercent(percentFromClientX(event.clientX));
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.id !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLSpanElement>) {
    if (reduced) return;
    const step = event.shiftKey ? 10 : 5;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = Math.min(100, shownPercent() + step);
    else if (event.key === 'ArrowLeft')
      next = Math.max(0, shownPercent() - step);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 100;
    else return;
    event.preventDefault();
    setPercent(next);
  }

  return (
    <figure className={manual ? 'peeper-case is-scrubbed' : 'peeper-case'}>
      <div className="peeper-case-frame">
        <span className="peeper-case-label peeper-case-label-input">
          {inputLabel}
        </span>
        <div
          ref={stageRef}
          className={
            dragging ? 'peeper-case-stage is-dragging' : 'peeper-case-stage'
          }
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDragStart={(event) => event.preventDefault()}
        >
          <div className="peeper-case-photo">
            <img src={inputSrc} alt={inputLabel} draggable={false} />
          </div>
          <div
            className="peeper-case-result"
            style={manual ? { width: `${percent}%` } : undefined}
          >
            <ViewportVideo
              src={videoSrc}
              poster={poster}
              ariaLabel={resultLabel}
              controls
              showMuteToggle={false}
              className="peeper-case-video"
            />
          </div>
          <span
            className="peeper-case-sash"
            role={reduced ? undefined : 'slider'}
            tabIndex={reduced ? undefined : 0}
            aria-hidden={reduced ? true : undefined}
            aria-orientation={reduced ? undefined : 'horizontal'}
            aria-valuemin={reduced ? undefined : 0}
            aria-valuemax={reduced ? undefined : 100}
            aria-valuenow={
              reduced ? undefined : Math.round(manual ? percent : 0)
            }
            aria-label={reduced ? undefined : `${inputLabel} / ${resultLabel}`}
            onKeyDown={onKeyDown}
            style={manual ? { left: `${percent}%` } : undefined}
          />
        </div>
        <span className="peeper-case-label peeper-case-label-result">
          {resultLabel}
        </span>
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
