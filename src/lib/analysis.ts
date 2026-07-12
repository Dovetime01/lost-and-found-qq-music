import { recommendSongs, songs, type Song } from './songs.ts'
import type { EvidenceArtifact } from './evidenceArtifacts.ts'

export interface ConcertInfo {
  concertName: string
  artist: string
  date: string
  city: string
  venue: string
  /** Optional raw ticket OCR text retained for emotion-claim generation. */
  ticketOCR?: string
}

export interface EvidenceInput {
  id: string
  type: string
  label: string
  content: string
  artifact?: EvidenceArtifact
}

export interface MemoryProfile {
  emotionTags: string[]
  dominantEmotion: string
  lostItem: string
  foundLocation: string
  status: string
  custody: string
  note: string
  narrativeLines: string[]
  playlist: Song[]
  primarySong: Song
}

const DEFAULT_TAGS = ['怀旧', '温柔']

const ruleGroups: Array<{ tags: string[]; keywords: string[] }> = [
  {
    tags: ['不舍', '遗憾'],
    keywords: ['难过', '失落', '舍不得', '不舍', '留在', '那晚', '离开', '遗憾', '哭'],
  },
  {
    tags: ['热烈', '释放'],
    keywords: ['开心', '激动', '燃', '终于', '见到', '尖叫', '发光', '快乐', '热烈'],
  },
  {
    tags: ['青春', '回忆'],
    keywords: ['青春', '回忆', '以前', '从前', '学生', '朋友', '曾经', '那一年'],
  },
  {
    tags: ['释然', '修复'],
    keywords: ['释怀', '放下', '好好', '慢慢', '往前', '治愈', '修复', '原谅'],
  },
  {
    tags: ['自我', '释放'],
    keywords: ['自己', '自由', '勇敢', '倔强', '奔跑', '释放'],
  },
]

function addUnique(target: string[], values: string[]) {
  values.forEach((value) => {
    if (!target.includes(value)) target.push(value)
  })
}

export function analyzeInput(userText: string): string[] {
  const normalizedText = userText.trim()
  const emotionTags: string[] = []

  ruleGroups.forEach((group) => {
    if (group.keywords.some((keyword) => normalizedText.includes(keyword))) {
      addUnique(emotionTags, group.tags)
    }
  })

  if (emotionTags.length === 0) {
    addUnique(emotionTags, DEFAULT_TAGS)
  }

  return emotionTags
}

export function generateLostItem(emotionTags: string[]): string {
  if (emotionTags.includes('不舍')) return '那个不想从现场离开的自己'
  if (emotionTags.includes('热烈')) return '那个在人群中尽情发光的自己'
  if (emotionTags.includes('青春')) return '那个被一首歌带回青春的自己'
  if (emotionTags.includes('释然')) return '那个终于愿意慢慢往前走的自己'
  if (emotionTags.includes('自我')) return '那个重新听见自己声音的自己'
  return '那个被音乐暂时保管起来的自己'
}

export function generateFoundLocation(emotionTags: string[], primarySong: Song): string {
  if (emotionTags.includes('不舍')) return `《${primarySong.title}》副歌响起后的第三十秒`
  if (emotionTags.includes('热烈')) return `全场灯光亮起、你跟着《${primarySong.title}》大声唱的时候`
  if (emotionTags.includes('青春')) return `被《${primarySong.title}》带回从前的那一段路上`
  if (emotionTags.includes('释然')) return `返程路上再次听见《${primarySong.title}》的时候`
  return `QQ音乐曲库匹配到《${primarySong.title}》-${primarySong.artist} 的时候`
}

export function generateNote(emotionTags: string[], primarySong: Song): string {
  if (emotionTags.includes('不舍')) return `他没有留在现场，只是暂时住进了《${primarySong.title}》里。`
  if (emotionTags.includes('热烈')) return `那一刻不是幻觉，是你在人海里真的发过光。`
  if (emotionTags.includes('青春')) return `原来青春没有走远，只是换成旋律回来找你。`
  if (emotionTags.includes('释然')) return `有些遗憾不必追回，能好好带走就已经算找回。`
  return `这份记忆没有丢失，只是被《${primarySong.title}》替你保管了一会儿。`
}

export function generateNarrativeLines(
  concertInfo: ConcertInfo,
  emotionTags: string[],
  primarySong: Song
): string[] {
  const artist = concertInfo.artist || '那位歌手'
  const place = concertInfo.venue || concertInfo.city || '那一晚'

  if (emotionTags.includes('不舍')) {
    return [
      `你以为遗失的是 ${place} 的灯光。`,
      `其实遗失的是那个不想散场的自己。`,
      `《${primarySong.title}》替你把不舍先收好。`,
      `等你愿意回头，它还会在歌里等你。`,
    ]
  }

  if (emotionTags.includes('热烈')) {
    return [
      `你终于见到了 ${artist}，也见到了发光的自己。`,
      `那些尖叫、合唱和心跳不是短暂噪音。`,
      `《${primarySong.title}》把它们压成一张可以重播的唱片。`,
      `以后需要勇气的时候，就从这里取回。`,
    ]
  }

  if (emotionTags.includes('青春')) {
    return [
      `你带去的是票根，带回来的却是一整段青春。`,
      `以前的自己没有消失，只是藏在某一句合唱里。`,
      `《${primarySong.title}》像一条旧路，把你送回那一年。`,
      `然后再陪你慢慢回到现在。`,
    ]
  }

  if (emotionTags.includes('释然')) {
    return [
      `返程路上，你开始把那一晚轻轻放好。`,
      `不是忘记，而是终于允许它变成温柔的部分。`,
      `《${primarySong.title}》负责收尾。`,
      `你负责继续往前走。`,
    ]
  }

  return [
    `你把一小段自己寄存在 ${artist} 的歌里。`,
    `它没有真正遗失，只是换了一种方式保存。`,
    `《${primarySong.title}》是今天的保管编号。`,
    `想念的时候，按下播放就能取回。`,
  ]
}

export function analyzeMemory(concertInfo: ConcertInfo, evidences: EvidenceInput[]): MemoryProfile {
  const evidenceText = evidences
    .map((evidence) => evidence.artifact?.aiDescription ?? evidence.artifact?.extractedText ?? evidence.content)
    .join(' ')
  const concertText = [
    concertInfo.concertName,
    concertInfo.artist,
    concertInfo.date,
    concertInfo.city,
    concertInfo.venue,
  ].join(' ')
  const emotionTags = analyzeInput(`${evidenceText} ${concertText}`)
  const playlist = recommendSongs(emotionTags, concertInfo.artist)
  const resolvedPlaylist = playlist.length > 0 ? playlist : songs.slice(0, 8)
  const primarySong = resolvedPlaylist[0]

  return {
    emotionTags,
    dominantEmotion: emotionTags[0],
    lostItem: generateLostItem(emotionTags),
    foundLocation: generateFoundLocation(emotionTags, primarySong),
    status: '未真正遗失',
    custody: `${primarySong.stage} · 音乐档案库`,
    note: generateNote(emotionTags, primarySong),
    narrativeLines: generateNarrativeLines(concertInfo, emotionTags, primarySong),
    playlist: resolvedPlaylist,
    primarySong,
  }
}
