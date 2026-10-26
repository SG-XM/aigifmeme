import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { mergeVideoAudio } from './merge-video-audio';

describe('Window Peeper soundtrack mux', () => {
  it('adds an audio track to a silent generation', async () => {
    const video = readFileSync(
      'public/videos/showcase/window-peeper/example-result.mp4'
    );
    const audio = readFileSync('public/audio/window-peeper-reference.m4a');
    const merged = await mergeVideoAudio(video, audio);
    const out = join(tmpdir(), 'peeper-mux-test.mp4');
    writeFileSync(out, merged);
    const probe = execFileSync(
      'ffprobe',
      [
        '-hide_banner',
        '-show_streams',
        '-select_streams',
        'a',
        '-of',
        'compact',
        out,
      ],
      { encoding: 'utf8' }
    );
    expect(probe).toContain('codec_type=audio');
    expect(probe).toMatch(/codec_name=aac|codec_name=mp3|codec_name=opus/);
  }, 60_000);
});
