import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assembleRadio } from './radioAssembly.ts';

const concertInfo = {
  concertName: '测试演唱会',
  artist: '陶喆',
  date: '2026.07.12',
  city: '上海',
  venue: '测试场馆',
};

function track(id, title, artist = '陶喆') {
  return {
    id,
    title,
    artist,
    album: '测试专辑',
    duration: '3:30',
    coverUrl: '',
    playUrl: '',
    qqMusicUrl: '',
    tags: [],
    reason: '',
  };
}

test('maps five radio steps and uses cold percentile track for step 4', async () => {
  const calls = [];
  const result = await assembleRadio({
    anchor: {
      id: '1001',
      songMid: 'anchor-mid',
      title: '普通朋友',
      artist: '陶喆',
      source: 'qq-music',
      recognitionSource: 'acrcloud',
    },
    artistCatalog: {
      artist: '陶喆',
      singerMid: 'singer-mid',
      singerId: '4558',
      topTracks: [
        track('hot-1', '普通朋友'),
        track('hot-2', '爱很简单'),
        track('hot-3', '蝴蝶'),
        track('hot-4', '月亮代表谁的心'),
      ],
      source: 'qq-music',
      ready: true,
    },
    emotionTags: ['热烈', '不舍'],
    concertInfo,
  }, {}, {
    similar: async () => {
      calls.push('similar');
      return [
        track('sim-1', '爱到无路可退', '彭佳慧'),
        track('sim-2', '找自己'),
      ];
    },
    intent: async () => {
      calls.push('intent');
      return [track('intent-1', '千千阙歌', '陈慧娴')];
    },
    search: async (query) => {
      calls.push(`search:${query}`);
      return [track('search-noise', '乱入歌曲', '其他歌手')];
    },
    coldTrack: async (singer, options) => {
      calls.push(`cold:${singer.mid}:${options.percentile}`);
      assert.equal(options.percentile, 0.7);
      assert.ok(options.exclude?.some((item) => item.title === '普通朋友'));
      return track('cold-1', '今天你要嫁给我');
    },
  });

  assert.equal(result.playlist.length, 5);
  assert.deepEqual(result.playlist.map((step) => step.stage), [
    'liveWarmth',
    'emotionResonance',
    'crowdLoop',
    'longUnheard',
    'backToReality',
  ]);
  assert.equal(result.playlist[0].title, '普通朋友');
  assert.equal(result.playlist[1].title, '爱到无路可退');
  assert.equal(result.playlist[2].artist, '陶喆');
  assert.equal(result.playlist[3].title, '今天你要嫁给我');
  assert.equal(result.playlist[3].artist, '陶喆');
  assert.match(result.playlist[3].reason ?? '', /七成|冷门/);
  assert.equal(result.playlist[4].title, '千千阙歌');
  assert.ok(calls.includes('similar'));
  assert.ok(calls.includes('intent'));
  assert.ok(calls.includes('cold:singer-mid:0.7'));
});

test('skips duplicate cold picks already used in earlier steps', async () => {
  const result = await assembleRadio({
    anchor: {
      id: '1001',
      songMid: 'anchor-mid',
      title: '普通朋友',
      artist: '陶喆',
      source: 'qq-music',
      recognitionSource: 'acrcloud',
    },
    artistCatalog: {
      artist: '陶喆',
      singerMid: 'singer-mid',
      singerId: null,
      topTracks: [
        track('hot-1', '普通朋友'),
        track('hot-2', '爱很简单'),
        track('hot-3', '蝴蝶'),
        track('hot-4', '沙滩'),
      ],
      source: 'qq-music',
      ready: true,
    },
    emotionTags: ['温柔'],
    concertInfo,
  }, {}, {
    similar: async () => [track('sim-1', '找自己')],
    intent: async () => [track('intent-1', '归途', '其他')],
    search: async () => [],
    coldTrack: async () => track('hot-2', '爱很简单'), // would collide with step ③
  });

  assert.equal(result.playlist[2].title, '爱很简单');
  assert.notEqual(result.playlist[3].title, '爱很简单');
  assert.equal(result.playlist[3].artist, '陶喆');
});

test('uses artist hot track as substitute anchor when recognition is missing', async () => {
  const result = await assembleRadio({
    artistCatalog: {
      artist: '陶喆',
      singerMid: 'singer-mid',
      singerId: null,
      topTracks: [
        track('hot-1', '爱很简单'),
        track('hot-2', '蝴蝶'),
        track('hot-3', '普通朋友'),
      ],
      source: 'qq-music',
      ready: true,
    },
    emotionTags: ['温柔'],
    concertInfo,
  }, {}, {
    similar: async () => [],
    intent: async () => [track('intent-1', '归途', '其他')],
    search: async () => [],
    coldTrack: async () => track('cold-1', '二十二'),
  });

  assert.equal(result.playlist[0].title, '爱很简单');
  assert.match(result.playlist[0].reason ?? '', /回声/);
  assert.equal(result.playlist[3].title, '二十二');
  assert.equal(result.playlist.length, 5);
});

test('uses stable five-line copy when LLM is unavailable', async () => {
  const result = await assembleRadio({
    emotionTags: ['温柔'],
    concertInfo,
  }, {}, {
    similar: async () => [],
    intent: async () => [],
    search: async () => [],
    coldTrack: async () => null,
  });

  assert.equal(result.recommendLines.length, 5);
  assert.equal(result.steps, result.playlist);
});
