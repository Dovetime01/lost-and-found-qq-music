import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  createXfyunHeaders,
  normalizeXfyunResponse,
  recognizeSongFromWav,
  XFYUN_SONG_URL,
} from './xfyunSongRecognition.ts';

test('creates Xunfei checksum headers from apiKey, time, and X-Param', () => {
  const headers = createXfyunHeaders('appid', 'secret', 1_700_000_000_000);
  const expected = createHash('md5')
    .update(`secret${headers['X-CurTime']}${headers['X-Param']}`)
    .digest('hex');
  const params = JSON.parse(Buffer.from(headers['X-Param'], 'base64').toString());

  assert.equal(headers['X-Appid'], 'appid');
  assert.equal(headers['X-CheckSum'], expected);
  assert.deepEqual(params, { engine_type: 'afs', aue: 'raw', sample_rate: '16000' });
});

test('normalizes candidate response and prioritizes OCR artist', () => {
  const candidates = normalizeXfyunResponse({
    data: {
      song_list: [
        { songname: '同名歌曲', singname: '其他歌手', score: 99 },
        { songname: '目标歌曲', singname: '蔡依林', score: 60 },
      ],
    },
  }, '蔡依林');

  assert.equal(candidates[0].title, '目标歌曲');
  assert.equal(candidates[0].artist, '蔡依林');
});

test('normalizes the documented song and singer response fields', () => {
  const candidates = normalizeXfyunResponse({
    code: '0',
    data: [
      { song: '千里之外', song_id: '6433782', singer: '周杰伦' },
      { song: '千里之外', song_id: '5233627', singer: '刘芳' },
    ],
  }, '周杰伦');

  assert.equal(candidates[0].title, '千里之外');
  assert.equal(candidates[0].artist, '周杰伦');
  assert.equal(candidates[0].id, '6433782');
});

test('posts WAV bytes and returns standardized Xunfei result', async () => {
  const wav = Buffer.alloc(100, 1);
  const calls = [];
  const result = await recognizeSongFromWav(wav, '五月天', {
    appId: 'appid',
    apiKey: 'secret',
    now: () => 1_700_000_000_000,
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        async json() {
          return { code: 0, data: { list: [{ song_name: '拥抱', singer_name: '五月天' }] } };
        },
      };
    },
  });

  assert.equal(calls[0].url, XFYUN_SONG_URL);
  assert.deepEqual(Buffer.from(calls[0].init.body), wav);
  assert.equal(result.best.title, '拥抱');
  assert.equal(result.candidates.length, 1);
});
