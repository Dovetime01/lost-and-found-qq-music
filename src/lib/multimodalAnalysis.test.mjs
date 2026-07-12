import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  analyzeMultimodal,
  buildLocalMultimodalResult,
  DEFAULT_CLAIM_REASON,
  DEFAULT_EMOTION_TAGS,
  DEFAULT_LOST_ITEM,
  EMOTION_TAG_VOCABULARY,
} from './multimodalAnalysis.ts';

function responsesOk(content) {
  return {
    ok: true,
    async json() {
      return {
        output: [{
          type: 'message',
          content: [{ type: 'output_text', text: content }],
        }],
      };
    },
  };
}

test('local emotion-claim fallback uses defaults and does not invent modalities', () => {
  const result = buildLocalMultimodalResult({ spokenText: '散场以后很舍不得' });

  assert.equal(result.lostItem, DEFAULT_LOST_ITEM);
  assert.equal(result.claimReason, DEFAULT_CLAIM_REASON);
  assert.deepEqual(result.emotionTags, DEFAULT_EMOTION_TAGS);
  assert.equal(result.modalities.photo, false);
  assert.equal(result.modalities.voice, false);
  assert.equal(result.status.fallbackUsed, true);
});

test('AI result keeps LostFoundResult fields and filters emotion tags', async () => {
  const result = await analyzeMultimodal({
    lyrics: '这是青春的回忆',
    artistName: '五月天',
    concertName: '好好好想见到你',
    venue: '鸟巢',
    city: '北京',
    ticketOCR: '五月天 鸟巢',
    songTitle: '干杯',
    songArtist: '五月天',
  }, {
    apiKey: 'key',
    model: 'doubao-seed-2-0-lite-260428',
    fetcher: async (url, init) => {
      assert.match(String(url), /\/responses$/);
      const body = JSON.parse(String(init?.body ?? '{}'));
      assert.equal(body.model, 'doubao-seed-2-0-lite-260428');
      const userContent = body.input?.[0]?.content;
      const textPart = Array.isArray(userContent)
        ? userContent.find((part) => part.type === 'input_text')?.text ?? ''
        : '';
      assert.match(textPart, /演唱会艺人：\n五月天/);
      assert.match(textPart, /OCR识别结果：\n五月天 鸟巢/);
      assert.match(textPart, /视频识别到的歌曲名：\n干杯/);
      assert.match(textPart, /视频识别到的歌曲艺人：\n五月天/);
      assert.match(textPart, /lostItem/);
      assert.doesNotMatch(textPart, /visualAtmosphere/);

      return responsesOk(JSON.stringify({
        lostItem: '「那个相信青春不会结束的自己」',
        claimReason: '世界恢复了平常，\n\n只有耳边还留着那晚一起合唱的回声。',
        emotionTags: ['青春', '不存在的标签', '回忆'],
      }));
    },
  });

  assert.equal(result.lostItem, '那个相信青春不会结束的自己');
  assert.equal(result.claimReason, '世界恢复了平常，\n只有耳边还留着那晚一起合唱的回声。');
  assert.deepEqual(result.emotionTags, ['青春', '回忆']);
  assert.ok(result.emotionTags.every((tag) => EMOTION_TAG_VOCABULARY.includes(tag)));
  assert.equal(result.status.source, 'ai');
  assert.equal('visualAtmosphere' in result, false);
  assert.equal('narrativeSummary' in result, false);
});

test('missing song fields are written as 未提供 in the prompt', async () => {
  const result = await analyzeMultimodal({
    spokenText: '散场了',
  }, {
    apiKey: 'key',
    model: 'model',
    fetcher: async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const userContent = body.input?.[0]?.content;
      const textPart = Array.isArray(userContent)
        ? userContent.find((part) => part.type === 'input_text')?.text ?? ''
        : '';
      assert.match(textPart, /视频识别到的歌曲名：\n未提供/);
      assert.match(textPart, /视频识别到的歌曲艺人：\n未提供/);
      return responsesOk(JSON.stringify({
        lostItem: '那份舍不得结束的心情',
        claimReason: '世界恢复了平常，只有耳边还留着那晚一起合唱的回声。',
        emotionTags: ['不舍', '温柔'],
      }));
    },
  });

  assert.equal(result.lostItem, '那份舍不得结束的心情');
});

test('missing JSON fields fall back to product defaults', async () => {
  const result = await analyzeMultimodal({ lyrics: '温柔地说再见' }, {
    apiKey: 'key',
    model: 'model',
    fetcher: async () => responsesOk(JSON.stringify({})),
  });

  assert.equal(result.lostItem, DEFAULT_LOST_ITEM);
  assert.equal(result.claimReason, DEFAULT_CLAIM_REASON);
  assert.deepEqual(result.emotionTags, DEFAULT_EMOTION_TAGS);
});

test('returns structurally consistent local fallback after provider failure', async () => {
  const result = await analyzeMultimodal({ lyrics: '温柔地说再见' }, {
    apiKey: 'key',
    model: 'model',
    fetcher: async () => {
      throw new Error('offline');
    },
  });

  assert.equal(result.lostItem, DEFAULT_LOST_ITEM);
  assert.equal(typeof result.claimReason, 'string');
  assert.ok(Array.isArray(result.emotionTags));
  assert.equal(result.status.fallbackUsed, true);
});
