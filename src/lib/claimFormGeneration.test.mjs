import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateClaimForm, requiresVagueMode } from './claimFormGeneration.ts';

const concertInfo = {
  concertName: '测试演唱会',
  artist: '测试歌手',
  date: '2026.07.12',
  city: '上海',
  venue: '测试场馆',
};

const multimodal = {
  lostItem: '那份舍不得结束的心情',
  claimReason: '世界恢复了平常，只有耳边还留着那晚一起合唱的回声。',
  emotionTags: ['不舍', '温柔'],
  modalities: { photo: false, videoFrame: false, voice: false, text: true, lyrics: false },
  status: { source: 'ai', provider: 'doubao-seed-2.0', fallbackUsed: false },
};

test('maps emotion-claim fields onto the claim card and enables vagueMode for fallback anchors', async () => {
  assert.equal(requiresVagueMode({
    title: '待确认歌曲',
    artist: '测试歌手',
    source: 'local-fallback',
  }), true);

  const form = await generateClaimForm({
    concertInfo,
    multimodal,
    anchor: { title: '待确认歌曲', artist: '测试歌手', source: 'local-fallback' },
  });

  assert.equal(form.vagueMode, true);
  assert.equal(form.lostItem, '那份舍不得结束的心情');
  assert.equal(form.claimReason, multimodal.claimReason);
  assert.equal(form.reflection, multimodal.claimReason);
  assert.equal(form.note, multimodal.claimReason);
  assert.deepEqual(form.emotionTags, ['不舍', '温柔']);
  assert.equal(form.lostItem, form.lostItemName);
  assert.ok(form.emotionIntensity >= 1 && form.emotionIntensity <= 10);
});

test('keeps verified-song foundLocation while reusing multimodal claim copy', async () => {
  const form = await generateClaimForm({
    concertInfo,
    multimodal,
    anchor: {
      title: '某首歌',
      artist: '测试歌手',
      source: 'qq-music',
      recognitionSource: 'acrcloud',
    },
  });

  assert.equal(form.vagueMode, false);
  assert.equal(form.lostItem, multimodal.lostItem);
  assert.equal(form.claimReason, multimodal.claimReason);
  assert.match(form.foundLocation, /某首歌/);
});
