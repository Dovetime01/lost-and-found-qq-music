import assert from 'node:assert/strict';
import { access, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  extractVideoAudio,
  mediaProcessingLimits,
  normalizeVoiceAudio,
  recognitionWindowTargets,
  resolveFfmpegPath,
} from './mediaProcessing.ts';

test('resolves Next.js ROOT-rewritten ffmpeg paths from the app directory', () => {
  const resolved = resolveFfmpegPath(
    '\\ROOT\\node_modules\\.pnpm\\ffmpeg-static\\ffmpeg.exe',
    'C:\\demo',
    (candidate) => candidate.includes('C:\\demo') && candidate.includes('.pnpm'),
  );

  assert.match(resolved, /C:\\demo/);
  assert.match(resolved, /\.pnpm/);
});

test('selects distinct start, middle, and end recognition windows', () => {
  assert.deepEqual(recognitionWindowTargets(50.75).map((value) => Number(value.toFixed(2))), [
    7.5,
    25.38,
    43.25,
  ]);
  assert.deepEqual(recognitionWindowTargets(15), [7.5]);
});

test('extracts a 15-second mono 44.1k WAV for music recognition and cleans temporary files', async () => {
  let args;
  let inputPath;
  const wav = await extractVideoAudio(Buffer.from('video'), '.mp4', 30, async (_executable, value) => {
    args = value;
    inputPath = value[value.indexOf('-i') + 1];
    await writeFile(value.at(-1), Buffer.alloc(44));
  });

  assert.equal(wav.length, 44);
  assert.equal(args[args.indexOf('-t') + 1], String(mediaProcessingLimits.clipSeconds));
  assert.equal(args[args.indexOf('-ac') + 1], '1');
  assert.equal(args[args.indexOf('-ar') + 1], '44100');
  await assert.rejects(access(inputPath));
});

test('normalizes voice to short PCM WAV and enforces input boundaries', async () => {
  let args;
  await normalizeVoiceAudio(Buffer.from('voice'), 'webm', async (_executable, value) => {
    args = value;
    await writeFile(value.at(-1), Buffer.alloc(44));
  });

  assert.equal(args[args.indexOf('-t') + 1], String(mediaProcessingLimits.maxVoiceSeconds));
  assert.equal(args[args.indexOf('-sample_fmt') + 1], 's16');
  await assert.rejects(
    normalizeVoiceAudio(Buffer.alloc(mediaProcessingLimits.maxVoiceBytes + 1), '.wav', async () => {}),
    /between 1 byte/,
  );
});
