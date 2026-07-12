import test from 'node:test';
import assert from 'node:assert/strict';

const {
  createWallNoteFromArchive,
  listPublicWallNotes,
  publishPublicWallNote,
} = await import('./publicWall.ts');

const archiveItem = {
  id: 'LF-0703-12345',
  userId: 'lfu_user_1234',
  title: '那个在人群中尽情发光的自己',
  songTitle: '日不落',
  artist: '蔡依林',
  date: '2026.07.03',
  emotionTags: ['热烈', '释放'],
  note: '那一刻不是幻觉。',
  shareText: '我在《日不落》里找回了那个在人群中尽情发光的自己。',
};

test('creates a public wall note from an archive item', () => {
  const note = createWallNoteFromArchive(archiveItem);

  assert.equal(note.userId, 'lfu_user_1234');
  assert.equal(note.content, archiveItem.shareText);
  assert.equal(note.city, '匿名归途');
  assert.equal(note.likes, 1);
});

test('uses demo notes when Supabase config is missing', async () => {
  const result = await listPublicWallNotes({});

  assert.equal(result.source, 'demo');
  assert.ok(result.notes.length >= 3);
  assert.equal(result.provider.connected, false);
});

test('lists public notes from Supabase REST API', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      async json() {
        return [
          {
            id: 'note-1',
            user_id: 'lfu_user_a',
            content: '我把那晚留在歌里。',
            city: '上海',
            likes: 7,
            created_at: '2026-07-03T01:02:03.000Z',
          },
        ];
      },
    };
  };

  const result = await listPublicWallNotes({
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon-key',
    fetcher,
  });

  assert.equal(result.source, 'supabase');
  assert.equal(result.notes[0].id, 'note-1');
  assert.equal(result.notes[0].date, '2026.07.03');
  assert.equal(calls[0].url, 'https://project.supabase.co/rest/v1/public_lost_notes?select=*&order=created_at.desc&limit=30');
  assert.equal(calls[0].init.headers.apikey, 'anon-key');
});

test('publishes a public note to Supabase REST API', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      async json() {
        return [
          {
            id: 'note-2',
            user_id: 'lfu_user_1234',
            content: archiveItem.shareText,
            city: '匿名归途',
            likes: 0,
            created_at: '2026-07-03T02:00:00.000Z',
          },
        ];
      },
    };
  };

  const result = await publishPublicWallNote(createWallNoteFromArchive(archiveItem), {
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon-key',
    fetcher,
  });

  const body = JSON.parse(calls[0].init.body);

  assert.equal(result.source, 'supabase');
  assert.equal(result.note.id, 'note-2');
  assert.equal(calls[0].url, 'https://project.supabase.co/rest/v1/public_lost_notes');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(body.user_id, 'lfu_user_1234');
  assert.equal(body.content, archiveItem.shareText);
});
