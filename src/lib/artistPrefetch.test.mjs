import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as artistPrefetch from './artistPrefetch.ts';

function createTrack(id, title, artist = '周杰伦') {
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
    reason: '测试推荐',
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('starts singer lookup and popular track search in parallel', async () => {
  assert.equal(typeof artistPrefetch.prefetchArtistCatalog, 'function');

  const singer = deferred();
  const tracks = deferred();
  const started = [];
  const pending = artistPrefetch.prefetchArtistCatalog(
    '周杰伦',
    {},
    {
      querySinger: () => {
        started.push('singer');
        return singer.promise;
      },
      searchSongs: () => {
        started.push('tracks');
        return tracks.promise;
      },
    },
  );

  assert.deepEqual(started.sort(), ['singer', 'tracks']);
  singer.resolve({ id: '4558', mid: '0025NhlN2yWrP4', name: '周杰伦' });
  tracks.resolve(Array.from({ length: 12 }, (_, index) => createTrack(`track-${index}`, `歌曲${index}`)));

  const result = await pending;
  assert.equal(result.artist, '周杰伦');
  assert.equal(result.singerMid, '0025NhlN2yWrP4');
  assert.equal(result.singerId, '4558');
  assert.equal(result.topTracks.length, 10);
  assert.equal(result.source, 'qq-music');
  assert.equal(result.ready, true);
});

test('deduplicates popular tracks by id or title and artist', async () => {
  const result = await artistPrefetch.prefetchArtistCatalog('周杰伦', {}, {
    querySinger: async () => null,
    searchSongs: async () => [
      createTrack('one', '晴天'),
      createTrack('one', '晴天（重复ID）'),
      createTrack('two', '晴天'),
      createTrack('three', '稻香'),
    ],
  });

  assert.deepEqual(result.topTracks.map((track) => track.title), ['晴天', '稻香']);
});

test('uses local tracks when QQ Music search fails', async () => {
  const result = await artistPrefetch.prefetchArtistCatalog('周杰伦', {}, {
    querySinger: async () => ({ mid: 'jay-mid', name: '周杰伦' }),
    searchSongs: async () => { throw new Error('permission denied'); },
  });

  assert.equal(result.source, 'fallback');
  assert.equal(result.singerMid, 'jay-mid');
  assert.ok(result.topTracks.length > 0);
  assert.ok(result.topTracks.some((track) => track.artist === '周杰伦'));
});

test('keeps QQ Music tracks when singer lookup fails', async () => {
  const result = await artistPrefetch.prefetchArtistCatalog('周杰伦', {}, {
    querySinger: async () => { throw new Error('singer permission denied'); },
    searchSongs: async () => [createTrack('one', '晴天')],
  });

  assert.equal(result.source, 'qq-music');
  assert.equal(result.singerMid, null);
  assert.equal(result.singerId, null);
  assert.equal(result.topTracks[0].title, '晴天');
});

test('does not call QQ Music for an unresolved artist', async () => {
  let calls = 0;
  const result = await artistPrefetch.prefetchArtistCatalog('待确认艺人', {}, {
    querySinger: async () => { calls += 1; return null; },
    searchSongs: async () => { calls += 1; return []; },
  });

  assert.equal(calls, 0);
  assert.equal(result.source, 'fallback');
  assert.ok(result.topTracks.length > 0);
});

test('normalizes valid artist input and rejects unresolved values', () => {
  assert.equal(typeof artistPrefetch.normalizeArtistPrefetchInput, 'function');
  assert.equal(artistPrefetch.normalizeArtistPrefetchInput('  周杰伦  '), '周杰伦');
  assert.equal(artistPrefetch.normalizeArtistPrefetchInput(''), null);
  assert.equal(artistPrefetch.normalizeArtistPrefetchInput('待确认艺人'), null);
  assert.equal(artistPrefetch.normalizeArtistPrefetchInput(42), null);
});

test('ignores a stale artist prefetch result from an older request', () => {
  assert.equal(typeof artistPrefetch.startArtistPrefetch, 'function');
  assert.equal(typeof artistPrefetch.finishArtistPrefetch, 'function');

  const state = artistPrefetch.startArtistPrefetch('蔡依林');
  const staleResult = {
    artist: '周杰伦',
    singerMid: 'jay-mid',
    singerId: '1',
    topTracks: [createTrack('one', '晴天')],
    source: 'qq-music',
    ready: true,
  };
  const nextState = artistPrefetch.finishArtistPrefetch(state, staleResult);

  assert.equal(nextState, state);
  assert.equal(nextState.status, 'loading');
  assert.equal(nextState.requestArtist, '蔡依林');
});

test('stores the matching artist prefetch result in the session state', () => {
  assert.equal(typeof artistPrefetch.startArtistPrefetch, 'function');
  assert.equal(typeof artistPrefetch.finishArtistPrefetch, 'function');

  const state = artistPrefetch.startArtistPrefetch('周杰伦');
  const result = {
    artist: '周杰伦',
    singerMid: 'jay-mid',
    singerId: '4558',
    topTracks: [createTrack('one', '晴天')],
    source: 'qq-music',
    ready: true,
  };

  assert.deepEqual(artistPrefetch.finishArtistPrefetch(state, result), {
    status: 'ready',
    requestArtist: '周杰伦',
    result,
  });
});
