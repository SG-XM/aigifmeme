import {
  BufferSource,
  BufferTarget,
  Conversion,
  Input,
  Mp3InputFormat,
  Mp4InputFormat,
  Mp4OutputFormat,
  OggInputFormat,
  Output,
  UrlSource,
  WaveInputFormat,
  WebMInputFormat,
} from 'mediabunny';

/**
 * Keep the generated video track, replace its audio, and trim the soundtrack
 * to the shorter of the two. A finished file is not muxed again: Create only
 * calls this while the task is still `processing`, then marks it successful.
 */
export async function mergeVideoAudio(
  video: string | Uint8Array,
  soundtrack: Uint8Array
): Promise<Uint8Array> {
  const videoInput = new Input({
    source:
      typeof video === 'string'
        ? new UrlSource(video)
        : new BufferSource(video),
    formats: [new Mp4InputFormat(), new WebMInputFormat()],
  });
  const audioInput = new Input({
    source: new BufferSource(soundtrack),
    formats: [
      new Mp4InputFormat(),
      new WebMInputFormat(),
      new Mp3InputFormat(),
      new WaveInputFormat(),
      new OggInputFormat(),
    ],
  });
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  try {
    const [videoDuration, audioDuration] = await Promise.all([
      videoInput.computeDuration(),
      audioInput.computeDuration(),
    ]);
    const trimEnd = Math.min(videoDuration, audioDuration);
    if (!Number.isFinite(trimEnd) || trimEnd <= 0) {
      throw new Error('Video or uploaded audio has no playable duration.');
    }
    const [videoConversion, audioConversion] = await Promise.all([
      Conversion.init({
        input: videoInput,
        output,
        composable: true,
        audio: { discard: true },
        copy: { mode: 'forced' },
      }),
      Conversion.init({
        input: audioInput,
        output,
        composable: true,
        video: { discard: true },
        trim: { end: trimEnd },
      }),
    ]);
    if (!videoConversion.isValid || !audioConversion.isValid) {
      throw new Error(
        'Unable to combine this audio format with the generated video. Try an MP3, WAV, M4A, or MP4 audio file.'
      );
    }
    await output.start();
    await Promise.all([videoConversion.execute(), audioConversion.execute()]);
    await output.finalize();
    const result = target.buffer;
    if (!result?.byteLength) throw new Error('Combined video output is empty.');
    return new Uint8Array(result);
  } finally {
    videoInput.dispose();
    audioInput.dispose();
  }
}
