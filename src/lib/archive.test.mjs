import test from 'node:test';
import assert from 'node:assert/strict';

const {
  createArchiveItem,
  loadLatestArchive,
  saveLatestArchive,
} = await import('./archive.ts');
const { analyzeMemory } = await import('./analysis.ts');

const baseConcert = {
  concertName: '5522+2 回到那一天',
  artist: '五月天',
  date: '2026.05.18',
  city: '北京',
  venue: '国家体育场-鸟巢',
};

function createStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

test('creates an archive item from a memory profile', () => {
  const profile = analyzeMemory(baseConcert, [
    {
      id: 'note',
      type: 'note',
      label: '一句话',
      content: '终于见到他们了，特别开心，整晚都很燃很激动。',
    },
  ]);

  const item = createArchiveItem(profile, { userId: 'lfu_test_user' });

  assert.equal(item.userId, 'lfu_test_user');
  assert.equal(item.title, '那个在人群中尽情发光的自己');
  assert.equal(item.songTitle, '盛夏光年');
  assert.equal(item.artist, '五月天');
  assert.ok(item.emotionTags.includes('热烈'));
  assert.ok(item.shareText.includes('盛夏光年'));
  assert.ok(item.id.startsWith('LF-'));
});

test('creates an archive item with evidence photo urls', () => {
  const profile = analyzeMemory(baseConcert, []);

  const item = createArchiveItem(profile, {
    userId: 'lfu_test_user',
    photoDataUrls: ['data:image/png;base64,photo-a', 'data:image/png;base64,photo-b'],
  });

  assert.deepEqual(item.photoDataUrls, [
    'data:image/png;base64,photo-a',
    'data:image/png;base64,photo-b',
  ]);
});

test('saves and loads the latest archive item from storage', () => {
  const storage = createStorage();
  const profile = analyzeMemory(baseConcert, []);
  const item = createArchiveItem(profile, { userId: 'lfu_user_a' });

  saveLatestArchive(item, storage);

  assert.deepEqual(loadLatestArchive({ userId: 'lfu_user_a', storage }), item);
});

test('saves archive without crashing when photo data exceeds storage quota', () => {
  const storage = createStorage();
  const profile = analyzeMemory(baseConcert, []);
  const item = createArchiveItem(profile, {
    userId: 'lfu_user_quota',
    photoDataUrls: [
      `data:image/png;base64,${'a'.repeat(1_000_000)}`,
      `data:image/png;base64,${'b'.repeat(1_000_000)}`,
    ],
  });
  const quotaStorage = {
    getItem: storage.getItem,
    setItem(key, value) {
      if (String(value).length > 500_000) {
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      }
      storage.setItem(key, value);
    },
  };

  const saved = saveLatestArchive(item, quotaStorage);

  assert.deepEqual(saved.photoDataUrls, []);
  assert.equal(loadLatestArchive({ userId: 'lfu_user_quota', storage }).title, item.title);
});

test('scopes latest archive records by local user id', () => {
  const storage = createStorage();
  const profile = analyzeMemory(baseConcert, []);
  const itemA = createArchiveItem(profile, { userId: 'lfu_user_a', date: new Date('2026-07-02T12:00:00Z') });
  const itemB = createArchiveItem(profile, { userId: 'lfu_user_b', date: new Date('2026-07-02T12:00:01Z') });

  saveLatestArchive(itemA, storage);
  saveLatestArchive(itemB, storage);

  assert.deepEqual(loadLatestArchive({ userId: 'lfu_user_a', storage }), itemA);
  assert.deepEqual(loadLatestArchive({ userId: 'lfu_user_b', storage }), itemB);
});

test('returns null when stored archive is invalid', () => {
  const storage = createStorage();
  storage.setItem('lost-and-found.latestArchive.lfu_user_a', '{bad json');

  assert.equal(loadLatestArchive({ userId: 'lfu_user_a', storage }), null);
});
