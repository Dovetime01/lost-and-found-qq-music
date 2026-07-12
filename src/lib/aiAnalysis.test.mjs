import test from 'node:test';
import assert from 'node:assert/strict';

const { analyzeMemorySmart } = await import('./aiAnalysis.ts');

const baseConcert = {
  concertName: '5522+2 回到那一天',
  artist: '五月天',
  date: '2026.05.18',
  city: '北京',
  venue: '国家体育场-鸟巢',
};

const excitedEvidence = [
  {
    id: 'note',
    type: 'note',
    label: '一句话',
    content: '终于见到他们了，特别开心，整晚都很燃很激动。',
  },
];

test('uses rule analysis when AI configuration is missing', async () => {
  const result = await analyzeMemorySmart(baseConcert, excitedEvidence, {});

  assert.equal(result.source, 'rule');
  assert.equal(result.provider.recommendationMode, 'local-fallback');
  assert.equal(result.provider.canRecommendAnyArtist, false);
  assert.equal(result.profile.dominantEmotion, '热烈');
  assert.equal(result.profile.primarySong.title, '盛夏光年');
});

test('calls an OpenAI-compatible endpoint and normalizes the AI profile', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  emotionTags: ['热烈', '释放'],
                  dominantEmotion: '热烈',
                  lostItem: '那个在人群中尽情发光的自己',
                  foundLocation: '全场灯光亮起的时候',
                  status: '已找回',
                  custody: 'AI音乐档案库',
                  note: '那一刻不是幻觉，是你真的发过光。',
                  narrativeLines: [
                    '你终于见到了五月天。',
                    '那些心跳被重新收进唱片。',
                    '《盛夏光年》替你保存这一刻。',
                  ],
                  recommendedSongTitles: ['盛夏光年', '干杯'],
                }),
              },
            },
          ],
        };
      },
    };
  };

  const result = await analyzeMemorySmart(baseConcert, excitedEvidence, {
    apiKey: 'test-key',
    baseUrl: 'https://example.test/api/v3',
    model: 'test-model',
    fetcher,
  });

  assert.equal(result.source, 'ai');
  assert.equal(result.provider.recommendationMode, 'open-ai');
  assert.equal(result.provider.canRecommendAnyArtist, true);
  assert.equal(result.profile.lostItem, '那个在人群中尽情发光的自己');
  assert.equal(result.profile.primarySong.title, '盛夏光年');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.test/api/v3/chat/completions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-key');
  assert.deepEqual(JSON.parse(calls[0].init.body).thinking, { type: 'disabled' });
});

test('accepts AI-generated songs that are not in the local fallback catalog', async () => {
  const fetcher = async () => ({
    ok: true,
    async json() {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                emotionTags: ['温柔', '修复'],
                dominantEmotion: '温柔',
                lostItem: '那个被现场轻轻接住的自己',
                foundLocation: '返程路上重新想起那一刻的时候',
                status: '已找回',
                custody: 'AI音乐档案库',
                note: '这首歌更适合今天的你。',
                narrativeLines: [
                  '你把一小段自己寄存在王菲的歌里。',
                  '《如愿》替你把温柔收好。',
                ],
                recommendedSongs: [
                  {
                    title: '如愿',
                    artist: '王菲',
                    duration: '4:25',
                    tags: ['温柔', '修复'],
                    stage: 'AI情绪匹配',
                    reason: '适合把被现场接住的柔软带回日常。',
                  },
                  {
                    title: '给自己的情书',
                    artist: '王菲',
                    duration: '4:28',
                    tags: ['自我', '温柔'],
                    stage: 'AI情绪匹配',
                    reason: '适合把这一晚写回自己心里。',
                  },
                ],
              }),
            },
          },
        ],
      };
    },
  });

  const result = await analyzeMemorySmart(
    {
      concertName: '王菲幻乐一场',
      artist: '王菲',
      date: '2026.01.01',
      city: '上海',
      venue: '梅赛德斯奔驰文化中心',
    },
    [],
    {
      apiKey: 'test-key',
      baseUrl: 'https://example.test/api/v3',
      model: 'test-model',
      fetcher,
    }
  );

  assert.equal(result.source, 'ai');
  assert.equal(result.provider.recommendationMode, 'open-ai');
  assert.equal(result.provider.canRecommendAnyArtist, true);
  assert.equal(result.profile.primarySong.title, '如愿');
  assert.equal(result.profile.primarySong.artist, '王菲');
  assert.equal(result.profile.primarySong.reason, '适合把被现场接住的柔软带回日常。');
});

test('uses QQ Music adapter after LLM analysis when music config is available', async () => {
  const llmFetcher = async () => ({
    ok: true,
    async json() {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                emotionTags: ['热烈', '释放'],
                dominantEmotion: '热烈',
                themes: ['舞台高光', '终于见到'],
                lostItem: '那个在人群中尽情发光的自己',
                foundLocation: '全场灯光亮起的时候',
                status: '已找回',
                custody: 'LLM情绪档案库',
                note: '那一刻不是幻觉，是你真的发过光。',
                narrativeLines: ['你终于见到了蔡依林，也见到了发光的自己。'],
                musicQueries: ['蔡依林 日不落', '热烈 舞台'],
                recommendedSongs: [
                  {
                    title: '日不落',
                    artist: '蔡依林',
                    duration: '3:45',
                    tags: ['热烈', '释放'],
                    stage: 'AI情绪匹配',
                    reason: '适合把高光留在归途。',
                  },
                ],
              }),
            },
          },
        ],
      };
    },
  });

  const qqRequests = [];
  const result = await analyzeMemorySmart(
    {
      concertName: 'Ugly Beauty 世界巡回演唱会',
      artist: '蔡依林',
      date: '2025.08.16',
      city: '上海',
      venue: '梅赛德斯奔驰文化中心',
    },
    excitedEvidence,
    {
      apiKey: 'llm-key',
      baseUrl: 'https://llm.example.test/api/v3',
      model: 'llm-model',
      fetcher: llmFetcher,
      qqMusic: {
        appId: 'qq-app-id',
        appKey: 'qq-app-key',
        baseUrl: 'https://qq.example.test',
        fetcher: async (url) => {
          qqRequests.push(String(url));
          return {
            ok: true,
            async json() {
              return {
                tracks: [
                  {
                    id: 'qq-3001',
                    title: '日不落',
                    artist: '蔡依林',
                    album: '特务J',
                    duration: '3:45',
                    qqMusicUrl: 'https://y.qq.com/song/3001',
                  },
                ],
              };
            },
          };
        },
      },
    }
  );

  assert.equal(result.source, 'ai');
  assert.equal(result.provider.recommendationMode, 'qq-music');
  assert.equal(result.provider.musicProviderLabel, 'QQ音乐曲库');
  assert.equal(result.profile.primarySong.title, '日不落');
  assert.equal(result.profile.primarySong.qqMusicUrl, 'https://y.qq.com/song/3001');
  assert.deepEqual(result.profile.narrativeLines, ['你终于见到了蔡依林，也见到了发光的自己。']);
  assert.ok(qqRequests.some((url) => url.includes('opi_cmd=fcg_music_custom_search.fcg')));
  assert.ok(qqRequests.some((url) => url.includes('w=%E8%94%A1%E4%BE%9D%E6%9E%97')));
});

test('falls back to rule analysis when the AI response is invalid', async () => {
  const fetcher = async () => ({
    ok: true,
    async json() {
      return {
        choices: [{ message: { content: 'not json' } }],
      };
    },
  });

  const result = await analyzeMemorySmart(baseConcert, excitedEvidence, {
    apiKey: 'test-key',
    baseUrl: 'https://example.test/api/v3',
    model: 'test-model',
    fetcher,
  });

  assert.equal(result.source, 'fallback');
  assert.equal(result.provider.recommendationMode, 'local-fallback');
  assert.equal(result.provider.canRecommendAnyArtist, false);
  assert.equal(result.profile.dominantEmotion, '热烈');
  assert.equal(result.profile.primarySong.title, '盛夏光年');
});

test('still uses QQ Music when LLM analysis falls back', async () => {
  const qqRequests = [];
  const result = await analyzeMemorySmart(
    {
      concertName: 'Ugly Beauty 世界巡回演唱会',
      artist: '蔡依林',
      date: '2025.08.16',
      city: '上海',
      venue: '梅赛德斯奔驰文化中心',
    },
    excitedEvidence,
    {
      apiKey: 'llm-key',
      baseUrl: 'https://llm.example.test/api/v3',
      model: 'llm-model',
      fetcher: async () => ({ ok: false, status: 504 }),
      qqMusic: {
        appId: 'qq-app-id',
        appKey: 'qq-app-key',
        baseUrl: 'https://qq.example.test',
        fetcher: async (url) => {
          qqRequests.push(String(url));
          return {
            ok: true,
            async json() {
              return {
                list: [
                  {
                    song_id: 3001,
                    song_name: '日不落',
                    singer_name: '蔡依林',
                    album_name: '特务J',
                    song_play_time: 225,
                    song_h5_url: 'https://y.qq.com/song/3001',
                  },
                ],
              };
            },
          };
        },
      },
    }
  );

  assert.equal(result.source, 'fallback');
  assert.equal(result.provider.recommendationMode, 'qq-music');
  assert.equal(result.provider.musicProviderLabel, 'QQ音乐曲库');
  assert.equal(result.profile.primarySong.title, '日不落');
  assert.equal(result.profile.primarySong.source, 'qq-music');
  assert.ok(result.profile.foundLocation.includes('《日不落》'));
  assert.ok(result.profile.note.includes('《日不落》') || result.profile.narrativeLines.some((line) => line.includes('《日不落》')));
  assert.ok(result.profile.narrativeLines.some((line) => line.includes('《日不落》')));
  assert.ok(qqRequests.some((url) => url.includes('opi_cmd=fcg_music_custom_search.fcg')));
});

test('times out slow LLM analysis and continues with QQ Music', async () => {
  const result = await analyzeMemorySmart(
    {
      concertName: 'Ugly Beauty 世界巡回演唱会',
      artist: '蔡依林',
      date: '2025.08.16',
      city: '上海',
      venue: '梅赛德斯奔驰文化中心',
    },
    [{ id: 'note', type: 'note', label: '一句话', content: '终于见到她了，很开心，想听日不落。' }],
    {
      apiKey: 'llm-key',
      baseUrl: 'https://llm.example.test/api/v3',
      model: 'llm-model',
      llmTimeoutMs: 5,
      fetcher: async (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
      qqMusic: {
        appId: 'qq-app-id',
        appKey: 'qq-app-key',
        baseUrl: 'https://qq.example.test',
        fetcher: async () => ({
          ok: true,
          async json() {
            return {
              list: [
                {
                  song_id: 3001,
                  song_name: '日不落',
                  singer_name: '蔡依林',
                  album_name: '特务J',
                  song_play_time: 225,
                  song_h5_url: 'https://y.qq.com/song/3001',
                },
              ],
            };
          },
        }),
      },
    }
  );

  assert.equal(result.source, 'fallback');
  assert.equal(result.provider.recommendationMode, 'qq-music');
  assert.equal(result.profile.primarySong.title, '日不落');
  assert.equal(result.profile.primarySong.source, 'qq-music');
  assert.ok(result.profile.foundLocation.includes('《日不落》'));
  assert.ok(result.profile.note.includes('《日不落》') || result.profile.narrativeLines.some((line) => line.includes('《日不落》')));
  assert.ok(result.profile.narrativeLines.some((line) => line.includes('《日不落》')));
});
