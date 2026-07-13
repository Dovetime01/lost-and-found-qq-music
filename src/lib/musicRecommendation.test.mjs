import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getSimilarQQMusicSongs,
  isUsableIntentTrack,
  mapEmotionTagToTrackType,
  recommendQQMusicTracks,
  searchQQMusicByIntent,
  searchQQMusicSongs,
} from './musicRecommendation.ts';
import * as musicRecommendation from './musicRecommendation.ts';

const baseDraft = {
  emotionTags: ['热烈', '释放'],
  themes: ['终于见到', '全场合唱'],
  lostItem: '那个在人群中尽情发光的自己',
  foundLocation: '全场灯光亮起的时候',
  note: '那一刻不是幻觉，是你真的发过光。',
  narrativeLines: ['你终于见到了她，也见到了发光的自己。'],
  musicQueries: ['日不落', '热烈 舞台'],
};

const baseConcert = {
  concertName: 'Ugly Beauty 世界巡回演唱会',
  artist: '蔡依林',
  date: '2025.08.16',
  city: '上海',
  venue: '梅赛德斯奔驰文化中心',
};

test('uses local fallback tracks when QQ Music config is missing', async () => {
  const result = await recommendQQMusicTracks(baseDraft, baseConcert);

  assert.equal(result.source, 'fallback');
  assert.equal(result.fallbackUsed, true);
  assert.ok(result.tracks.length > 0);
  assert.ok(result.tracks.some((track) => track.artist === '蔡依林'));
});

test('searches QQ Music and normalizes tracks from adapter response', async () => {
  const requests = [];
  const tracks = await searchQQMusicSongs('蔡依林 日不落', {
    appId: 'app-id',
    appKey: 'app-key',
    baseUrl: 'https://qplaycloud.y.qq.com/rpc_proxy/fcgi-bin/music_open_api.fcg',
    fetcher: async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        async json() {
          return {
            list: [
              {
                song_id: 1001,
                song_mid: 'qq-mid-1001',
                song_name: '日不落',
                singer_name: '蔡依林',
                album_name: '特务J',
                song_play_time: 225,
                album_pic_300x300: 'https://img.example/cover.jpg',
                song_play_url: '',
                song_play_url_standard: '',
                try_30s_url: 'https://play.example/song',
                song_h5_url: 'https://y.qq.com/song/1001',
              },
            ],
          };
        },
      };
    },
  });

  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].title, '日不落');
  assert.equal(tracks[0].artist, '蔡依林');
  assert.equal(tracks[0].playUrl, '');
  assert.equal(tracks[0].tryUrl, 'https://play.example/song');
  assert.equal(tracks[0].qqMusicUrl, 'https://y.qq.com/song/1001');
  assert.ok(String(requests[0].url).includes('opi_cmd=fcg_music_custom_search.fcg'));
  assert.ok(String(requests[0].url).includes('w=%E8%94%A1%E4%BE%9D%E6%9E%97+%E6%97%A5%E4%B8%8D%E8%90%BD'));
  assert.ok(String(requests[0].url).includes('app_id=app-id'));
  assert.equal(requests[0].init.headers['X-QYOPI-Sign'].length, 64);
});

test('uses QQ Music recommendation result when adapter returns tracks', async () => {
  const result = await recommendQQMusicTracks(baseDraft, baseConcert, {
    appId: 'app-id',
    appKey: 'app-key',
    baseUrl: 'https://qq.example.test',
    fetcher: async () => ({
      ok: true,
      async json() {
        return {
          tracks: [
            {
              id: 'qq-2001',
              title: '舞娘',
              artist: '蔡依林',
              duration: '3:06',
              qqMusicUrl: 'https://y.qq.com/song/2001',
            },
          ],
        };
      },
    }),
  });

  assert.equal(result.source, 'qq-music');
  assert.equal(result.provider.connected, true);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.tracks[0].title, '舞娘');
});

test('prioritizes tracks whose artist matches the recognized concert artist', async () => {
  const result = await recommendQQMusicTracks(
    {
      emotionTags: ['温柔', '遗憾'],
      themes: ['没说出口的话'],
      lostItem: '没说出口的半句话',
      foundLocation: '现场灯影里',
      note: '温柔又想哭。',
      narrativeLines: ['听到 more than words 的时候，有些话留在现场。'],
      musicQueries: ['give me more than words', 'more than words'],
    },
    {
      concertName: '羊文学 LIVE',
      artist: '羊文学',
      date: '2026.07.03',
      city: '上海',
      venue: 'Livehouse',
    },
    {
      appId: 'app-id',
      appKey: 'app-key',
      baseUrl: 'https://qq.example.test',
      fetcher: async () => ({
        ok: true,
        async json() {
          return {
            tracks: [
              {
                id: 'qq-thai',
                title: 'มากกว่าที่รัก (More Than Words)',
                artist: 'Emi Thasorn',
                duration: '4:17',
              },
              {
                id: 'qq-hitsuji',
                title: 'more than words',
                artist: '羊文学',
                duration: '4:49',
              },
            ],
          };
        },
      }),
    }
  );

  assert.equal(result.source, 'qq-music');
  assert.equal(result.tracks[0].title, 'more than words');
  assert.equal(result.tracks[0].artist, '羊文学');
});

test('falls back to local tracks when QQ Music request fails', async () => {
  const result = await recommendQQMusicTracks(baseDraft, baseConcert, {
    appId: 'app-id',
    appKey: 'app-key',
    baseUrl: 'https://qq.example.test',
    fetcher: async () => ({ ok: false, status: 500 }),
  });

  assert.equal(result.source, 'fallback');
  assert.equal(result.provider.connected, false);
  assert.equal(result.fallbackUsed, true);
  assert.ok(result.tracks.length > 0);
});

test('queries QQ Music singer list and normalizes singer_mid', async () => {
  assert.equal(typeof musicRecommendation.queryQQMusicSinger, 'function');

  const calls = [];
  const singer = await musicRecommendation.queryQQMusicSinger('周杰伦', {
    appId: 'app-id',
    appKey: 'app-key',
    baseUrl: 'https://music.example.test/api',
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        async json() {
          return {
            ret: 0,
            data: {
              singer_list: [
                { singer_mid: '0025NhlN2yWrP4', singer_name: '周杰伦' },
              ],
            },
          };
        },
      };
    },
  });

  assert.deepEqual(singer, { mid: '0025NhlN2yWrP4', name: '周杰伦' });
  assert.match(calls[0].url, /opi_cmd=fcg_music_custom_query_singer_list\.fcg/);
  assert.match(calls[0].url, /singer_name=%E5%91%A8%E6%9D%B0%E4%BC%A6/);
  assert.ok(calls[0].init.headers['X-QYOPI-Sign']);
});

test('fetches singer songs by heat and picks the ~70% cold track without excluded titles', async () => {
  const calls = [];
  const pages = {
    0: {
      ret: 0,
      song_sum: 10,
      singer_mid: '0025NhlN2yWrP4',
      singer_name: '周杰伦',
      songlist: Array.from({ length: 10 }, (_, index) => ({
        song_id: 1000 + index,
        song_mid: `mid-${index}`,
        song_name: `歌曲${index}`,
        singer_name: '周杰伦',
        album_name: '测试',
        song_play_time: 200,
      })),
    },
  };

  const track = await musicRecommendation.getQQMusicSingerTrackAtPercentile(
    { mid: '0025NhlN2yWrP4' },
    {
      percentile: 0.7,
      exclude: [{ id: '1007', title: '歌曲7', artist: '周杰伦' }],
      config: {
        appId: 'app-id',
        appKey: 'app-key',
        baseUrl: 'https://music.example.test/api',
        fetcher: async (url) => {
          calls.push(url);
          const page = new URL(url).searchParams.get('page_index') ?? '0';
          return {
            ok: true,
            async json() {
              return pages[page] ?? pages[0];
            },
          };
        },
      },
    },
  );

  assert.match(calls[0], /opi_cmd=fcg_music_custom_get_singer_info\.fcg/);
  assert.match(calls[0], /order=1/);
  assert.match(calls[0], /num_per_page=50/);
  // 0.7 * 9 = 6.3 -> index 6, but if excluded walk to nearest
  assert.ok(track);
  assert.notEqual(track.title, '歌曲7');
  assert.equal(track.artist, '周杰伦');
});

test('returns null when QQ Music singer list is empty', async () => {
  const singer = await musicRecommendation.queryQQMusicSinger('未知歌手', {
    appId: 'app-id',
    appKey: 'app-key',
    baseUrl: 'https://music.example.test/api',
    fetcher: async () => ({
      ok: true,
      async json() {
        return { ret: 0, data: { singer_list: [] } };
      },
    }),
  });

  assert.equal(singer, null);
});

test('throws provider details when QQ Music singer lookup is rejected', async () => {
  await assert.rejects(
    musicRecommendation.queryQQMusicSinger('周杰伦', {
      appId: 'app-id',
      appKey: 'app-key',
      baseUrl: 'https://music.example.test/api',
      fetcher: async () => ({
        ok: true,
        async json() {
          return { ret: 1001, sub_ret: 41, msg: 'permission denied' };
        },
      }),
    }),
    /ret=1001, sub_ret=41, msg=permission denied/,
  );
});

test('builds signed similar-song URL and normalizes songlist', async () => {
  const calls = [];
  const tracks = await getSimilarQQMusicSongs({ songMid: 'mid-001' }, true, {
    appId: 'app-id',
    appKey: 'private-key',
    baseUrl: 'https://music.example.test/api',
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        async json() {
          return {
            data: {
              songlist: [{
                song_mid: 'mid-002',
                song_name: '第二首歌',
                author: '测试歌手',
              }],
            },
          };
        },
      };
    },
  });

  assert.equal(tracks[0].songMid, 'mid-002');
  assert.equal(tracks[0].artist, '测试歌手');
  assert.match(calls[0].url, /opi_cmd=fcg_music_custom_get_similar_song\.fcg/);
  assert.match(calls[0].url, /song_mid=mid-001/);
  assert.match(calls[0].url, /has_rec=1/);
  assert.doesNotMatch(calls[0].url, /private-key|app_key/);
  assert.equal(calls[0].init.headers['X-QYOPI-Sign'].length, 64);
});

test('builds music_skill cmd_params and normalizes play_command list', async () => {
  let capturedUrl = '';
  const tracks = await searchQQMusicByIntent({ emotionTag: '不舍', artist: '五月天' }, {
    appId: 'app-id',
    appKey: 'private-key',
    baseUrl: 'https://music.example.test/api',
    openId: 'openid',
    accessToken: 'token',
    fetcher: async (url) => {
      capturedUrl = String(url);
      return {
        ok: true,
        async json() {
          return {
            data: {
              play_command: {
                play_list: [
                  { mid: 'intent-mid', name: '知足', author: '五月天' },
                  { mid: 'other-mid', name: '归途', author: '某歌手' },
                ],
              },
            },
          };
        },
      };
    },
  });

  const url = new URL(capturedUrl);
  const command = JSON.parse(url.searchParams.get('cmd_params'));
  assert.equal(url.searchParams.get('opi_cmd'), 'music_skill');
  assert.equal(url.searchParams.get('opi_protocol_version'), '1');
  assert.equal(command.play_item_limit, command.play_item_cnt);
  assert.equal(command.app_info.name, 'QQ音乐失物招领处');
  assert.equal(command.request.request_id.startsWith('lost-found-'), true);
  assert.equal(command.original_question, '推荐五月天适合不舍情绪的歌曲');
  assert.equal(command.music_skill_mode, '1');
  assert.equal(command.intent.name, 'SearchSong');
  assert.deepEqual(command.intent.slots, [
    { name: 'Singer', value: '五月天', intent_type: 0 },
    { name: 'TrackType', value: '伤感', intent_type: 0 },
  ]);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].title, '知足');
  assert.equal(tracks[0].artist, '五月天');
  assert.equal(url.searchParams.has('app_key'), false);
});

test('maps product emotion tags to official TrackType moods', () => {
  assert.equal(mapEmotionTagToTrackType('不舍'), '伤感');
  assert.equal(mapEmotionTagToTrackType('热烈'), '快乐');
  assert.equal(mapEmotionTagToTrackType('怀旧'), '怀旧');
  assert.equal(mapEmotionTagToTrackType('未知标签'), '伤感');
});

test('rejects Cyrillic intent tracks but allows Latin artist names', () => {
  assert.equal(isUsableIntentTrack({
    title: '归途',
    artist: '陈慧娴',
    playUrl: '',
  }), true);
  assert.equal(isUsableIntentTrack({
    title: 'Go Further',
    artist: 'Chinese Football',
    playUrl: '',
  }), true);
  assert.equal(isUsableIntentTrack({
    title: 'Здравствуй',
    artist: 'Unknown',
    playUrl: 'https://example.test/a.mp3',
  }), false);
});
