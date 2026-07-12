import test from 'node:test';
import assert from 'node:assert/strict';

const { analyzeMemory } = await import('./analysis.ts');

const baseConcert = {
  concertName: '5522+2 回到那一天',
  artist: '五月天',
  date: '2026.05.18',
  city: '北京',
  venue: '国家体育场-鸟巢',
};

test('detects reluctant memories and recommends gentle repair songs', () => {
  const profile = analyzeMemory(baseConcert, [
    {
      id: 'note',
      type: 'note',
      label: '一句话',
      content: '我好像把自己留在那晚了，真的舍不得离开。',
    },
  ]);

  assert.equal(profile.dominantEmotion, '不舍');
  assert.ok(profile.emotionTags.includes('遗憾'));
  assert.equal(profile.lostItem, '那个不想从现场离开的自己');
  assert.equal(profile.primarySong.title, '拥抱');
  assert.ok(profile.playlist.some((song) => song.title === '好好'));
});

test('detects excited memories and recommends high-energy songs', () => {
  const profile = analyzeMemory(baseConcert, [
    {
      id: 'note',
      type: 'note',
      label: '一句话',
      content: '终于见到他们了，特别开心，整晚都很燃很激动。',
    },
  ]);

  assert.equal(profile.dominantEmotion, '热烈');
  assert.ok(profile.emotionTags.includes('释放'));
  assert.equal(profile.lostItem, '那个在人群中尽情发光的自己');
  assert.equal(profile.primarySong.title, '盛夏光年');
  assert.ok(profile.playlist.some((song) => song.title === '干杯'));
});

test('detects youth memories and recommends recall songs', () => {
  const profile = analyzeMemory(baseConcert, [
    {
      id: 'lyrics',
      type: 'lyrics',
      label: '一句歌词',
      content: '听到以前常听的歌，青春和回忆一下子都回来了。',
    },
  ]);

  assert.equal(profile.dominantEmotion, '青春');
  assert.ok(profile.emotionTags.includes('回忆'));
  assert.equal(profile.lostItem, '那个被一首歌带回青春的自己');
  assert.ok(profile.playlist.some((song) => song.title === '干杯'));
});

test('uses stable demo defaults when input is sparse', () => {
  const profile = analyzeMemory(baseConcert, []);

  assert.equal(profile.dominantEmotion, '怀旧');
  assert.ok(profile.emotionTags.includes('温柔'));
  assert.equal(profile.lostItem, '那个被音乐暂时保管起来的自己');
  assert.equal(profile.primarySong.artist, '五月天');
  assert.ok(profile.narrativeLines.length >= 3);
});

test('prefers recognized artist when only ticket info is available', () => {
  const profile = analyzeMemory(
    {
      concertName: '嘉年华世界巡回演唱会',
      artist: '周杰伦',
      date: '2025.09.12',
      city: '上海',
      venue: '上海体育场',
    },
    []
  );

  assert.equal(profile.dominantEmotion, '怀旧');
  assert.equal(profile.primarySong.artist, '周杰伦');
  assert.ok(profile.narrativeLines.some((line) => line.includes(`《${profile.primarySong.title}》`)));
});

test('uses recognized artist context without locking recommendations to one artist', () => {
  const profile = analyzeMemory(
    {
      concertName: '嘉年华世界巡回演唱会',
      artist: '周杰伦',
      date: '2025.09.12',
      city: '上海',
      venue: '上海体育场',
    },
    [
      {
        id: 'note',
        type: 'note',
        label: '一句话',
        content: '听到以前常听的歌，青春和回忆一下子都回来了。',
      },
    ]
  );

  assert.ok(profile.playlist.some((song) => song.artist === '周杰伦'));
  assert.ok(profile.playlist.some((song) => song.artist !== '周杰伦'));
});

test('prefers manually entered Jolin Tsai artist context for excited memories', () => {
  const profile = analyzeMemory(
    {
      concertName: 'Ugly Beauty 世界巡回演唱会',
      artist: '蔡依林',
      date: '2025.08.16',
      city: '上海',
      venue: '梅赛德斯奔驰文化中心',
    },
    [
      {
        id: 'note',
        type: 'note',
        label: '一句话',
        content: '终于见到蔡依林了，特别开心，整晚都很燃很激动。',
      },
    ]
  );

  assert.equal(profile.dominantEmotion, '热烈');
  assert.equal(profile.primarySong.artist, '蔡依林');
  assert.ok(profile.narrativeLines.some((line) => line.includes(`《${profile.primarySong.title}》`)));
  assert.ok(!profile.narrativeLines.some((line) => line.includes('《盛夏光年》')));
});
