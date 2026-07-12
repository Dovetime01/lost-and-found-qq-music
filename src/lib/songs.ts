export interface Song {
  id: number
  chapter: string
  title: string
  artist: string
  album?: string
  duration: string
  tags: string[]
  relatedArtists: string[]
  stage: string
  reason: string
  tagColor: string
  coverUrl?: string
  playUrl?: string
  tryUrl?: string
  qqMusicUrl?: string
  source?: string
}

export const songs: Song[] = [
  {
    id: 1,
    chapter: '遗落序章',
    title: '拥抱',
    artist: '五月天',
    duration: '3:42',
    tags: ['不舍', '遗憾', '温柔', '共鸣'],
    relatedArtists: ['五月天'],
    stage: '现场余温',
    reason: '适合把舍不得说出口，让那一晚慢慢落回心里。',
    tagColor: '#C41E3A',
  },
  {
    id: 2,
    chapter: '晚声回响',
    title: '干杯',
    artist: '五月天',
    duration: '4:15',
    tags: ['青春', '回忆', '热烈', '共鸣'],
    relatedArtists: ['五月天'],
    stage: '集体共鸣',
    reason: '适合把青春、朋友和人海里的合唱重新举起来。',
    tagColor: '#C9A46A',
  },
  {
    id: 3,
    chapter: '缄默心事',
    title: '知足',
    artist: '五月天',
    duration: '3:58',
    tags: ['释然', '遗憾', '温柔', '怀旧'],
    relatedArtists: ['五月天'],
    stage: '回到现实',
    reason: '适合在遗憾里留一点光，承认拥有过已经很好。',
    tagColor: '#7ECFD3',
  },
  {
    id: 4,
    chapter: '情绪峰值',
    title: '盛夏光年',
    artist: '五月天',
    duration: '4:33',
    tags: ['热烈', '释放', '燃', '自我'],
    relatedArtists: ['五月天'],
    stage: '情绪峰值',
    reason: '适合把激动和发光的自己推到最高点。',
    tagColor: '#E7DCC1',
  },
  {
    id: 5,
    chapter: '归位终章',
    title: '好好',
    artist: '五月天',
    duration: '5:01',
    tags: ['告别', '怀旧', '修复', '不舍', '遗憾', '温柔'],
    relatedArtists: ['五月天'],
    stage: '情绪降落',
    reason: '适合把告别放轻一点，把自己温柔地带回日常。',
    tagColor: '#F7C46B',
  },
  {
    id: 6,
    chapter: '重新出发',
    title: '倔强',
    artist: '五月天',
    duration: '4:21',
    tags: ['自我', '释放', '热烈', '修复'],
    relatedArtists: ['五月天'],
    stage: '重新出发',
    reason: '适合把被现场唤醒的勇气带到明天。',
    tagColor: '#A8DADC',
  },
  {
    id: 7,
    chapter: '旧梦返场',
    title: '晴天',
    artist: '周杰伦',
    duration: '4:29',
    tags: ['青春', '回忆', '怀旧', '遗憾'],
    relatedArtists: ['周杰伦'],
    stage: '青春回望',
    reason: '适合把学生时代、暗恋和没说出口的话一起带回来。',
    tagColor: '#8CC7A1',
  },
  {
    id: 8,
    chapter: '星光档案',
    title: '稻香',
    artist: '周杰伦',
    duration: '3:43',
    tags: ['修复', '释然', '温柔', '回忆'],
    relatedArtists: ['周杰伦'],
    stage: '归途修复',
    reason: '适合在散场后把自己慢慢带回日常。',
    tagColor: '#E0B44F',
  },
  {
    id: 9,
    chapter: '人海回声',
    title: '孤勇者',
    artist: '陈奕迅',
    duration: '4:16',
    tags: ['热烈', '释放', '自我', '共鸣'],
    relatedArtists: ['陈奕迅'],
    stage: '万人合唱',
    reason: '适合把人群里的勇敢和合唱声一起收进身体。',
    tagColor: '#D75A4A',
  },
  {
    id: 10,
    chapter: '慢速告别',
    title: '红玫瑰',
    artist: '陈奕迅',
    duration: '4:00',
    tags: ['遗憾', '不舍', '怀旧', '告别'],
    relatedArtists: ['陈奕迅'],
    stage: '情绪回落',
    reason: '适合承认那些没能带走的心事。',
    tagColor: '#B13D4E',
  },
  {
    id: 11,
    chapter: '温柔转身',
    title: '慢慢喜欢你',
    artist: '莫文蔚',
    duration: '3:41',
    tags: ['温柔', '怀旧', '释然', '修复'],
    relatedArtists: ['莫文蔚', '梁静茹'],
    stage: '温柔余温',
    reason: '适合把现场之后的柔软，安静地放回生活里。',
    tagColor: '#E7A8A1',
  },
  {
    id: 12,
    chapter: '缺口认领',
    title: '可惜没如果',
    artist: '林俊杰',
    duration: '4:58',
    tags: ['遗憾', '不舍', '修复', '告别'],
    relatedArtists: ['林俊杰', '梁静茹'],
    stage: '遗憾认领',
    reason: '适合把如果、错过和没来得及说的话都放进认领单。',
    tagColor: '#9FB3D9',
  },
  {
    id: 13,
    chapter: '闪光片段',
    title: 'Shake It Off',
    artist: 'Taylor Swift',
    duration: '3:39',
    tags: ['热烈', '释放', '快乐', '自我'],
    relatedArtists: ['Taylor Swift'],
    stage: '情绪峰值',
    reason: '适合把演唱会后的兴奋和自由感继续放大。',
    tagColor: '#F2A65A',
  },
  {
    id: 14,
    chapter: '午夜归途',
    title: 'All Too Well',
    artist: 'Taylor Swift',
    duration: '5:29',
    tags: ['回忆', '遗憾', '不舍', '怀旧'],
    relatedArtists: ['Taylor Swift'],
    stage: '回忆长镜头',
    reason: '适合把一段记忆完整看完，再慢慢离开。',
    tagColor: '#C66B5D',
  },
  {
    id: 15,
    chapter: '女王返场',
    title: '日不落',
    artist: '蔡依林',
    duration: '3:45',
    tags: ['热烈', '释放', '快乐', '共鸣'],
    relatedArtists: ['蔡依林', 'Jolin Tsai'],
    stage: '全场发光',
    reason: '适合把终于见到她的兴奋、人海里的闪光和快乐一起留下。',
    tagColor: '#F6C453',
  },
  {
    id: 16,
    chapter: '舞台高光',
    title: '舞娘',
    artist: '蔡依林',
    duration: '3:06',
    tags: ['热烈', '释放', '燃', '自我'],
    relatedArtists: ['蔡依林', 'Jolin Tsai'],
    stage: '舞台峰值',
    reason: '适合把灯光、舞台和那个敢发光的自己推到最高点。',
    tagColor: '#D95F9F',
  },
  {
    id: 17,
    chapter: '自我认领',
    title: '玫瑰少年',
    artist: '蔡依林',
    duration: '3:16',
    tags: ['自我', '修复', '释放', '温柔'],
    relatedArtists: ['蔡依林', 'Jolin Tsai'],
    stage: '自我回声',
    reason: '适合把被现场唤醒的自我和勇气认真收好。',
    tagColor: '#D87093',
  },
  {
    id: 18,
    chapter: '旧爱倒带',
    title: '倒带',
    artist: '蔡依林',
    duration: '4:24',
    tags: ['遗憾', '不舍', '怀旧', '回忆'],
    relatedArtists: ['蔡依林', 'Jolin Tsai'],
    stage: '回忆倒带',
    reason: '适合把突然涌回来的旧记忆放进一首可以重播的歌。',
    tagColor: '#9D8CC7',
  },
]

export function recommendSongs(emotionTags: string[], concertArtist = ''): Song[] {
  const tagSet = new Set(emotionTags)
  const normalizedArtist = concertArtist.trim().toLowerCase()
  const hasOnlyDefaultMood =
    tagSet.size === 2 && tagSet.has('怀旧') && tagSet.has('温柔')
  const artistContextBoost = hasOnlyDefaultMood ? 2 : 2.5

  return songs
    .map((song) => ({
      song,
      score:
        song.tags.filter((tag) => tagSet.has(tag)).length +
        (normalizedArtist && song.relatedArtists.some((artist) => artist.toLowerCase() === normalizedArtist) ? artistContextBoost : 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.song.id - b.song.id)
    .map(({ song }) => song)
    .slice(0, 8)
}
