import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recognizeAcrCloudWav } from './acrcloudRecognition.ts';

test('prefers music candidates when both music and humming are present', async () => {
  const samples = [];
  const result = await recognizeAcrCloudWav(Buffer.alloc(44), {
    host: 'identify-cn-north-1.acrcloud.cn',
    accessKey: 'key',
    accessSecret: 'secret',
    sdkRunner: async (sample) => {
      samples.push(sample);
      return {
        status: { code: 0, msg: 'Success' },
        metadata: {
          humming: [{
            title: '哼唱候选',
            artists: [{ name: '其他' }],
            score: 90,
          }],
          music: [{
            title: '恋人',
            artists: [{ name: '李荣浩' }],
            album: { name: '耳朵' },
            score: 88,
            play_offset_ms: 500,
          }],
        },
      };
    },
  });

  assert.equal(samples.length, 1);
  assert.equal(result.mode, 'music');
  assert.deepEqual(result.candidates, [{
    title: '恋人',
    artist: '李荣浩',
    album: '耳朵',
    confidence: 88,
    playOffsetMs: 500,
    recognitionType: 'music',
  }]);
});

test('falls back to humming candidates when music metadata is empty', async () => {
  const result = await recognizeAcrCloudWav(Buffer.alloc(44), {
    host: 'identify-cn-north-1.acrcloud.cn',
    accessKey: 'key',
    accessSecret: 'secret',
    sdkRunner: async () => ({
      status: { code: 0, msg: 'Success' },
      metadata: {
        humming: [{
          title: '恋人',
          artists: [{ name: '李荣浩' }],
          album: { name: '耳朵' },
          score: 79,
          play_offset_ms: 500,
        }],
      },
    }),
  });

  assert.equal(result.mode, 'humming');
  assert.deepEqual(result.candidates, [{
    title: '恋人',
    artist: '李荣浩',
    album: '耳朵',
    confidence: 79,
    playOffsetMs: 500,
    recognitionType: 'humming',
  }]);
});

test('rejects non-successful ACRCloud provider responses', async () => {
  await assert.rejects(
    recognizeAcrCloudWav(Buffer.alloc(44), {
      host: 'identify-cn-north-1.acrcloud.cn',
      accessKey: 'key',
      accessSecret: 'secret',
      sdkRunner: async () => ({ status: { code: 3014, msg: 'invalid signature' } }),
    }),
    /music.*3014.*invalid signature/,
  );
});

test('treats a no-result response as an empty candidate list', async () => {
  const result = await recognizeAcrCloudWav(Buffer.alloc(44), {
    host: 'identify-cn-north-1.acrcloud.cn',
    accessKey: 'key',
    accessSecret: 'secret',
    sdkRunner: async () => ({ status: { code: 1001, msg: 'No Result' } }),
  });
  assert.deepEqual(result.candidates, []);
});

test('posts WAV audio to ACRCloud Identify over HTTP', async () => {
  const wav = Buffer.alloc(64, 1);
  let requestUrl = '';
  let requestMethod = '';
  /** @type {FormData | null} */
  let requestBody = null;

  const result = await recognizeAcrCloudWav(wav, {
    host: 'https://identify-cn-north-1.acrcloud.cn/',
    accessKey: 'key',
    accessSecret: 'secret',
    protocol: 'https',
    fetchImpl: async (input, init) => {
      requestUrl = String(input);
      requestMethod = init?.method ?? '';
      requestBody = init?.body instanceof FormData ? init.body : null;
      return new Response(JSON.stringify({
        status: { code: 0, msg: 'Success' },
        metadata: {
          music: [{
            title: '恋人',
            artists: [{ name: '李荣浩' }],
            score: 80,
          }],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  assert.equal(requestUrl, 'https://identify-cn-north-1.acrcloud.cn/v1/identify');
  assert.equal(requestMethod, 'POST');
  assert.ok(requestBody);
  assert.equal(requestBody.get('access_key'), 'key');
  assert.equal(requestBody.get('data_type'), 'audio');
  assert.equal(requestBody.get('sample_bytes'), '64');
  assert.equal(requestBody.get('signature_version'), '1');
  assert.ok(String(requestBody.get('signature') || '').length > 0);
  assert.equal(result.mode, 'music');
  assert.equal(result.candidates[0]?.title, '恋人');
});
