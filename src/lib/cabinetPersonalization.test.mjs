import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  loadCabinetPersonalization,
  saveCabinetPersonalization,
} from './cabinetPersonalization.ts';

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
  };
}

test('returns an empty personalization when no local record exists', () => {
  const storage = createMemoryStorage();

  const item = loadCabinetPersonalization('LF-0704-00001', storage);

  assert.deepEqual(item, {
    note: '',
    photoDataUrls: [],
    emotionTags: [],
  });
});

test('saves and loads cabinet personalization by archive id', () => {
  const storage = createMemoryStorage();

  saveCabinetPersonalization(
    'LF-0704-00001',
    {
      note: '散场以后在地铁口拍下来的灯牌。',
      photoDataUrls: ['data:image/png;base64,abc123', 'data:image/png;base64,def456'],
      emotionTags: ['温柔', '后劲很大'],
    },
    storage
  );

  const item = loadCabinetPersonalization('LF-0704-00001', storage);

  assert.equal(item.note, '散场以后在地铁口拍下来的灯牌。');
  assert.deepEqual(item.photoDataUrls, ['data:image/png;base64,abc123', 'data:image/png;base64,def456']);
  assert.deepEqual(item.emotionTags, ['温柔', '后劲很大']);
});

test('drops oversized cabinet photos instead of throwing on storage quota', () => {
  const storage = createMemoryStorage();
  const quotaStorage = {
    getItem: storage.getItem,
    setItem(key, value) {
      if (String(value).length > 500_000) {
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      }
      storage.setItem(key, value);
    },
  };

  const saved = saveCabinetPersonalization('LF-big-photo', {
    note: '这一张图太大了，但备注应该保住。',
    photoDataUrls: [`data:image/png;base64,${'a'.repeat(1_000_000)}`],
    emotionTags: ['热烈'],
  }, quotaStorage);

  assert.deepEqual(saved.photoDataUrls, []);
  assert.equal(saved.note, '这一张图太大了，但备注应该保住。');
  assert.deepEqual(loadCabinetPersonalization('LF-big-photo', storage).emotionTags, ['热烈']);
});

test('trims long user notes before saving', () => {
  const storage = createMemoryStorage();
  const longNote = '很'.repeat(260);

  saveCabinetPersonalization(
    'LF-0704-00001',
    {
      note: longNote,
      photoDataUrls: [],
      emotionTags: [],
    },
    storage
  );

  const item = loadCabinetPersonalization('LF-0704-00001', storage);

  assert.equal(item.note.length, 160);
});
