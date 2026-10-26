import type { RefObject } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';

import {
  CREW_SLOT_KEYS,
  HOMEPAGE_CLIP_SECONDS,
  type CrewSlotKey,
  type HomepageClipSeconds,
} from '@/lib/crew-slots';
import { m } from '@/paraglide/messages.js';

type SlotPhoto = { url: string; name: string };

const SLOT_LABEL: Record<CrewSlotKey, string> = {
  farLeft: 'L2',
  left: 'L',
  center: 'C',
  right: 'R',
  farRight: 'R2',
};

export function UptownCreateCard({
  lineup,
  slots,
  duration,
  busy,
  uploading,
  inputRef,
  onBrowse,
  onFiles,
  onRemove,
  onDuration,
}: {
  lineup: 'single' | 'multi';
  slots: Partial<Record<CrewSlotKey, SlotPhoto>>;
  duration: HomepageClipSeconds;
  busy: boolean;
  uploading: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onBrowse: (mode: 'single' | 'multi', target?: CrewSlotKey) => void;
  onFiles: (files: File[]) => void;
  onRemove: (slot: CrewSlotKey) => void;
  onDuration: (seconds: HomepageClipSeconds) => void;
}) {
  const center = slots.center;

  return (
    <div className="uptown-card">
      <div
        className="uptown-modes"
        role="group"
        aria-label={m['home.create.mode']()}
      >
        <button
          type="button"
          className="trend-button trend-button-primary uptown-pick"
          aria-pressed={lineup === 'single'}
          disabled={busy}
          onClick={() => onBrowse('single')}
        >
          {m['home.create.pick_one']()}
        </button>
        <button
          type="button"
          className="uptown-multi"
          aria-pressed={lineup === 'multi'}
          disabled={busy}
          onClick={() => onBrowse('multi')}
        >
          {m['home.create.pick_multi']()}
        </button>
      </div>

      <div
        className="uptown-photo"
        onClick={
          lineup === 'multi' && !busy ? () => onBrowse('multi') : undefined
        }
      >
        {lineup === 'single' ? (
          center ? (
            <div className="uptown-single">
              <button
                type="button"
                className="uptown-single-hit"
                disabled={busy}
                onClick={() => onBrowse('single')}
              >
                <img src={center.url} alt={center.name} />
                <span className="uptown-lead">
                  {m['home.create.center_lead']()}
                </span>
                <span className="uptown-replace">
                  {m['home.create.replace']()}
                </span>
              </button>
              <button
                type="button"
                className="uptown-remove"
                aria-label={m['create.remove_image']()}
                disabled={busy}
                onClick={() => onRemove('center')}
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="uptown-empty"
              disabled={busy}
              onClick={() => onBrowse('single')}
            >
              {uploading ? (
                <Loader2 className="size-7 animate-spin" />
              ) : (
                <ImagePlus className="size-7" />
              )}
              <span>{m['home.create.pick_one']()}</span>
            </button>
          )
        ) : (
          <div className="uptown-slots">
            {CREW_SLOT_KEYS.map((slot) => {
              const photo = slots[slot];
              const lead = slot === 'center';
              return (
                <div
                  key={slot}
                  className="uptown-slot"
                  data-lead={lead ? 'true' : undefined}
                >
                  <button
                    type="button"
                    className={photo ? 'uptown-slot-hit' : 'uptown-slot-empty'}
                    disabled={busy}
                    aria-label={
                      lead ? m['home.create.center_lead']() : SLOT_LABEL[slot]
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      onBrowse('multi', slot);
                    }}
                  >
                    {photo ? (
                      <img src={photo.url} alt={photo.name} />
                    ) : uploading && lead ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <>
                        <ImagePlus className="size-5" />
                        <span>{m['home.create.add_photo']()}</span>
                      </>
                    )}
                    <span className="uptown-slot-tag">
                      {lead ? 'C' : SLOT_LABEL[slot]}
                    </span>
                  </button>
                  {photo ? (
                    <button
                      type="button"
                      className="uptown-remove"
                      aria-label={m['create.remove_image']()}
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemove(slot);
                      }}
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="uptown-hint">
        {lineup === 'single'
          ? m['home.create.single_hint']()
          : m['home.create.multi_hint']()}
      </p>

      <fieldset className="uptown-length" disabled={busy}>
        <legend>{m['home.create.clip_length']()}</legend>
        <div
          className="uptown-length-pills"
          role="radiogroup"
          aria-label={m['home.create.clip_length']()}
        >
          {HOMEPAGE_CLIP_SECONDS.map((seconds) => (
            <button
              key={seconds}
              type="button"
              role="radio"
              aria-checked={duration === seconds}
              onClick={() => onDuration(seconds)}
            >
              {seconds}s
            </button>
          ))}
        </div>
      </fieldset>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={m['home.create.pick_one']()}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
