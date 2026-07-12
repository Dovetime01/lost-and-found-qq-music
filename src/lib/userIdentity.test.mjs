import test from 'node:test';
import assert from 'node:assert/strict';

const {
  LOCAL_USER_IDENTITY_KEY,
  getOrCreateLocalUserIdentity,
} = await import('./userIdentity.ts');

function createStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
}

test('creates and persists a local anonymous identity', () => {
  const storage = createStorage();
  const identity = getOrCreateLocalUserIdentity(storage, {
    now: new Date('2026-07-02T12:00:00Z'),
    random: () => 0.42,
  });

  assert.ok(identity.id.startsWith('lfu_'));
  assert.equal(identity.createdAt, '2026-07-02T12:00:00.000Z');
  assert.ok(identity.label.startsWith('访客 '));
  assert.equal(JSON.parse(storage.getItem(LOCAL_USER_IDENTITY_KEY)).id, identity.id);
});

test('returns the existing local identity instead of creating a new one', () => {
  const storage = createStorage();
  storage.setItem(LOCAL_USER_IDENTITY_KEY, JSON.stringify({
    id: 'lfu_existing_1234',
    createdAt: '2026-07-01T00:00:00.000Z',
    label: '访客 1234',
  }));

  const identity = getOrCreateLocalUserIdentity(storage, {
    now: new Date('2026-07-02T12:00:00Z'),
    random: () => 0.99,
  });

  assert.equal(identity.id, 'lfu_existing_1234');
  assert.equal(identity.label, '访客 1234');
});
