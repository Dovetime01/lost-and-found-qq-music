import {
  analyzeMemory,
  type ConcertInfo,
  type EvidenceInput,
  generateFoundLocation,
  generateNarrativeLines,
  generateNote,
  type MemoryProfile,
} from './analysis.ts'
import { recommendSongs, songs, type Song } from './songs.ts'
import {
  recommendQQMusicTracks,
  type MemoryProfileDraft,
  type MusicRecommendationResult,
  type MusicTrack,
  type QQMusicConfig,
} from './musicRecommendation.ts'

export type AnalysisSource = 'ai' | 'rule' | 'fallback'
export type RecommendationMode = 'qq-music' | 'open-ai' | 'local-fallback'

export interface AnalysisProviderStatus {
  recommendationMode: RecommendationMode
  canRecommendAnyArtist: boolean
  label: string
  description: string
  musicProviderLabel?: string
  musicFallbackUsed?: boolean
}

export interface AnalyzeMemorySmartResult {
  profile: MemoryProfile
  source: AnalysisSource
  message: string
  provider: AnalysisProviderStatus
}

interface AiAnalysisConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
  fetcher?: typeof fetch
  llmTimeoutMs?: number
  qqMusic?: QQMusicConfig
}

interface AiMemoryPayload {
  emotionTags?: unknown
  dominantEmotion?: unknown
  lostItem?: unknown
  foundLocation?: unknown
  status?: unknown
  custody?: unknown
  note?: unknown
  narrativeLines?: unknown
  themes?: unknown
  musicQueries?: unknown
  recommendedSongs?: unknown
  recommendedSongTitles?: unknown
}

interface AiSongPayload {
  title?: unknown
  artist?: unknown
  duration?: unknown
  tags?: unknown
  stage?: unknown
  reason?: unknown
}

const openAiProvider: AnalysisProviderStatus = {
  recommendationMode: 'open-ai',
  canRecommendAnyArtist: true,
  label: 'AI开放曲库',
  description: '已启用 AI 动态推荐，可根据任意艺人、票根和情绪生成歌单。',
}

const qqMusicAiProvider: AnalysisProviderStatus = {
  recommendationMode: 'qq-music',
  canRecommendAnyArtist: true,
  label: 'LLM情绪分析 + QQ音乐曲库',
  description: '已启用 LLM 情绪分析，并通过 QQ 音乐适配层匹配真实曲库推荐。',
  musicProviderLabel: 'QQ音乐曲库',
  musicFallbackUsed: false,
}

const localFallbackProvider: AnalysisProviderStatus = {
  recommendationMode: 'local-fallback',
  canRecommendAnyArtist: false,
  label: '本地兜底曲库',
  description: '当前未启用 AI 动态推荐，只会从本地兜底曲库匹配；接入 API 后可支持任意歌手。',
}

const ruleQQMusicProvider: AnalysisProviderStatus = {
  recommendationMode: 'qq-music',
  canRecommendAnyArtist: true,
  label: '规则情绪分析 + QQ音乐曲库',
  description: 'LLM 暂时不可用，已使用规则情绪分析，并继续通过 QQ 音乐曲库匹配真实歌曲。',
  musicProviderLabel: 'QQ音乐曲库',
  musicFallbackUsed: false,
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback

  const items = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())

  return items.length > 0 ? items : fallback
}

function normalizeAiSongs(value: unknown, emotionTags: string[]): Song[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item, index): Song | null => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const song = item as AiSongPayload
      const title = asString(song.title, '')
      const artist = asString(song.artist, '')
      if (!title || !artist) return null

      return {
        id: 10000 + index,
        chapter: 'AI推荐',
        title,
        artist,
        duration: asString(song.duration, '3:30'),
        tags: asStringArray(song.tags, emotionTags).slice(0, 5),
        relatedArtists: [artist],
        stage: asString(song.stage, 'AI情绪匹配'),
        reason: asString(song.reason, '由 AI 根据票根、艺人和情绪线索生成的推荐。'),
        tagColor: '#C9A46A',
      }
    })
    .filter((song): song is Song => Boolean(song))
}

function musicTrackToSong(track: MusicTrack, index: number, emotionTags: string[]): Song {
  return {
    id: 20000 + index,
    chapter: track.album || 'QQ音乐曲库',
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    tags: track.tags.length > 0 ? track.tags : emotionTags,
    relatedArtists: [track.artist],
    stage: 'QQ音乐曲库匹配',
    reason: track.reason,
    tagColor: '#31C27C',
    coverUrl: track.coverUrl,
    playUrl: track.playUrl,
    tryUrl: track.tryUrl,
    qqMusicUrl: track.qqMusicUrl,
    source: 'qq-music',
  }
}

function musicResultToPlaylist(result: MusicRecommendationResult, emotionTags: string[]): Song[] {
  return result.tracks.map((track, index) => musicTrackToSong(track, index, emotionTags))
}

function syncProfileWithPrimarySong(
  profile: MemoryProfile,
  playlist: Song[],
  concertInfo: ConcertInfo,
  custody: string
): MemoryProfile {
  const primarySong = playlist[0]

  return {
    ...profile,
    playlist,
    primarySong,
    foundLocation: generateFoundLocation(profile.emotionTags, primarySong),
    custody,
    note: generateNote(profile.emotionTags, primarySong),
    narrativeLines: generateNarrativeLines(concertInfo, profile.emotionTags, primarySong),
  }
}

function attachPlaylistToAiProfile(
  profile: MemoryProfile,
  playlist: Song[],
  custody: string
): MemoryProfile {
  return {
    ...profile,
    playlist,
    primarySong: playlist[0],
    custody,
  }
}

function buildPlaylist(
  emotionTags: string[],
  recommendedSongTitles: string[],
  recommendedSongs: unknown
): Song[] {
  const aiSongs = normalizeAiSongs(recommendedSongs, emotionTags)
  const recommended = recommendedSongTitles
    .map((title) => songs.find((song) => song.title === title))
    .filter((song): song is Song => Boolean(song))

  const matched = recommendSongs(emotionTags)
  const merged = [...aiSongs, ...recommended, ...matched]
  const unique = merged.filter(
    (song, index, list) => list.findIndex((item) => item.id === song.id) === index
  )

  return unique.length > 0 ? unique.slice(0, 8) : songs.slice(0, 8)
}

function parseAiPayload(content: string): AiMemoryPayload {
  const jsonText = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const objectMatch = jsonText.match(/\{[\s\S]*\}/)
  const parsed = JSON.parse(objectMatch?.[0] ?? jsonText) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI response is not an object')
  }
  return parsed as AiMemoryPayload
}

function normalizeAiProfile(
  payload: AiMemoryPayload,
  fallbackProfile: MemoryProfile
): MemoryProfile {
  const emotionTags = asStringArray(payload.emotionTags, fallbackProfile.emotionTags)
  const recommendedSongTitles = asStringArray(payload.recommendedSongTitles, [])
  const playlist = buildPlaylist(emotionTags, recommendedSongTitles, payload.recommendedSongs)
  const primarySong = playlist[0]

  return {
    emotionTags,
    dominantEmotion: asString(payload.dominantEmotion, emotionTags[0] ?? fallbackProfile.dominantEmotion),
    lostItem: asString(payload.lostItem, fallbackProfile.lostItem),
    foundLocation: asString(payload.foundLocation, fallbackProfile.foundLocation),
    status: asString(payload.status, fallbackProfile.status),
    custody: asString(payload.custody, fallbackProfile.custody),
    note: asString(payload.note, fallbackProfile.note),
    narrativeLines: asStringArray(payload.narrativeLines, fallbackProfile.narrativeLines).slice(0, 4),
    playlist,
    primarySong,
  }
}

function buildMemoryDraft(
  payload: AiMemoryPayload,
  profile: MemoryProfile,
  concertInfo: ConcertInfo
): MemoryProfileDraft {
  const themes = asStringArray(payload.themes, [profile.dominantEmotion])
  const musicQueries = asStringArray(payload.musicQueries, [
    `${concertInfo.artist} ${profile.dominantEmotion}`.trim(),
    ...profile.playlist.slice(0, 2).map((song) => `${song.title} ${song.artist}`),
  ])

  return {
    emotionTags: profile.emotionTags,
    themes,
    lostItem: profile.lostItem,
    foundLocation: profile.foundLocation,
    note: profile.note,
    narrativeLines: profile.narrativeLines,
    musicQueries,
  }
}

function buildRuleMusicQueries(concertInfo: ConcertInfo, evidences: EvidenceInput[], profile: MemoryProfile) {
  const textQueries = evidences.flatMap((evidence) => {
    const content = typeof evidence.content === 'string' ? evidence.content.trim() : ''
    if (!content) return []

    const hintMatch = content.match(/(?:想听|听到|听了|唱了|合唱|歌词|那首)([^，。,.!！?？\n]{1,24})/)
    const hint = hintMatch?.[1]?.trim()

    return [
      hint ? `${concertInfo.artist} ${hint}`.trim() : '',
      content.length <= 30 ? `${concertInfo.artist} ${content}`.trim() : '',
    ].filter(Boolean)
  })

  return [
    ...textQueries,
    concertInfo.artist,
    `${concertInfo.artist} ${profile.dominantEmotion}`.trim(),
    ...profile.emotionTags.map((tag) => `${concertInfo.artist} ${tag}`.trim()),
    ...profile.playlist.slice(0, 2).map((song) => `${song.title} ${song.artist}`),
  ]
}

function buildRuleMemoryDraft(
  profile: MemoryProfile,
  concertInfo: ConcertInfo,
  evidences: EvidenceInput[]
): MemoryProfileDraft {
  return {
    emotionTags: profile.emotionTags,
    themes: [profile.dominantEmotion, ...profile.emotionTags],
    lostItem: profile.lostItem,
    foundLocation: profile.foundLocation,
    note: profile.note,
    narrativeLines: profile.narrativeLines,
    musicQueries: buildRuleMusicQueries(concertInfo, evidences, profile),
  }
}

async function buildQQMusicFallbackResult(
  fallbackProfile: MemoryProfile,
  concertInfo: ConcertInfo,
  evidences: EvidenceInput[],
  config: AiAnalysisConfig,
  reason?: string
): Promise<AnalyzeMemorySmartResult> {
  const hasQQMusicConfig = Boolean(
    config.qqMusic?.appId && config.qqMusic.appKey && config.qqMusic.baseUrl
  )

  if (!hasQQMusicConfig) {
    return {
      profile: fallbackProfile,
      source: 'fallback',
      message: localFallbackProvider.description,
      provider: localFallbackProvider,
    }
  }

  const musicResult = await recommendQQMusicTracks(
    buildRuleMemoryDraft(fallbackProfile, concertInfo, evidences),
    concertInfo,
    config.qqMusic
  )
  const qqPlaylist = musicResultToPlaylist(musicResult, fallbackProfile.emotionTags)

  if (musicResult.source !== 'qq-music' || qqPlaylist.length === 0) {
    const provider = {
      ...localFallbackProvider,
      description: musicResult.provider.description,
      musicProviderLabel: musicResult.provider.label,
      musicFallbackUsed: musicResult.fallbackUsed,
    }

    return {
      profile: fallbackProfile,
      source: 'fallback',
      message: provider.description,
      provider,
    }
  }

  const provider = {
    ...ruleQQMusicProvider,
    description: reason
      ? `${ruleQQMusicProvider.description}（LLM 回退原因：${reason}）`
      : ruleQQMusicProvider.description,
    musicProviderLabel: musicResult.provider.label,
    musicFallbackUsed: false,
  }

  return {
    profile: syncProfileWithPrimarySong(
      fallbackProfile,
      qqPlaylist,
      concertInfo,
      'QQ音乐演唱会纪念夹'
    ),
    source: 'fallback',
    message: provider.description,
    provider,
  }
}

function summarizeEvidenceForPrompt(evidences: EvidenceInput[]) {
  return evidences.map((evidence) => {
    const artifact = evidence.artifact
    const summary = artifact?.aiDescription
      ?? artifact?.extractedText
      ?? evidence.content
      ?? ''

    return {
      label: evidence.label,
      type: artifact?.type ?? evidence.type,
      content: String(summary).slice(0, 500),
      emotionTags: artifact?.emotionTags ?? [],
    }
  })
}

function buildPrompt(concertInfo: ConcertInfo, evidences: EvidenceInput[], fallbackProfile: MemoryProfile) {
  const evidenceSummary = summarizeEvidenceForPrompt(evidences)
  const ruleReference = {
    emotionTags: fallbackProfile.emotionTags,
    dominantEmotion: fallbackProfile.dominantEmotion,
    lostItem: fallbackProfile.lostItem,
    primarySong: `${fallbackProfile.primarySong.title} - ${fallbackProfile.primarySong.artist}`,
  }

  return [
    '你是一个演唱会记忆产品「失物招领处」的情绪分析引擎。',
    '请根据用户的票根信息和线索，生成一个中文 JSON 对象。',
    '输出必须是纯 JSON，不要 Markdown，不要代码块。',
    'JSON 字段必须包含：emotionTags, dominantEmotion, lostItem, foundLocation, status, custody, note, narrativeLines, themes, musicQueries。',
    'emotionTags 选择 2-4 个短标签，例如：不舍、遗憾、热烈、释放、青春、回忆、释然、修复、怀旧、温柔、自我。',
    'musicQueries 是 3-5 个用于 QQ 音乐搜索的短关键词，例如：歌手名 + 用户提到的歌名、歌手名 + 情绪主题。',
    '不要生成 recommendedSongs，真实歌曲由 QQ 音乐 API 负责。',
    '不要照抄规则参考结果，要根据用户线索改写 lostItem、foundLocation、note 和 narrativeLines。',
    '文案要像失物认领单，具体、温柔、有现场感，不要太长。',
    '',
    `票根信息：${JSON.stringify(concertInfo)}`,
    `用户线索摘要：${JSON.stringify(evidenceSummary)}`,
    `规则参考：${JSON.stringify(ruleReference)}`,
  ].join('\n')
}

function describeAnalysisError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return 'LLM 请求超时'
  if (error instanceof Error) return error.message.slice(0, 120)
  return 'LLM 返回异常'
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs?: number
) {
  if (!timeoutMs || timeoutMs <= 0) {
    return fetcher(url, init)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetcher(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function analyzeMemorySmart(
  concertInfo: ConcertInfo,
  evidences: EvidenceInput[],
  config: AiAnalysisConfig = {}
): Promise<AnalyzeMemorySmartResult> {
  const fallbackProfile = analyzeMemory(concertInfo, evidences)

  if (!config.apiKey || !config.model) {
    return {
      profile: fallbackProfile,
      source: 'rule',
      message: localFallbackProvider.description,
      provider: localFallbackProvider,
    }
  }

  const fetcher = config.fetcher ?? fetch
  const baseUrl = (config.baseUrl ?? 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')
  const llmTimeoutMs = config.llmTimeoutMs

  try {
    const response = await fetchWithTimeout(fetcher, `${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.3,
        max_tokens: 500,
        thinking: { type: 'disabled' },
        messages: [
          {
            role: 'system',
            content: '你只输出可被 JSON.parse 解析的中文 JSON。',
          },
          {
            role: 'user',
            content: buildPrompt(concertInfo, evidences, fallbackProfile),
          },
        ],
      }),
    }, llmTimeoutMs)

    if (!response.ok) {
      throw new Error(`AI request failed with status ${response.status}`)
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('AI response has no message content')

    const payload = parseAiPayload(content)
    const aiProfile = normalizeAiProfile(payload, fallbackProfile)
    const hasQQMusicConfig = Boolean(
      config.qqMusic?.appId && config.qqMusic.appKey && config.qqMusic.baseUrl
    )
    const musicResult = hasQQMusicConfig
      ? await recommendQQMusicTracks(
          buildMemoryDraft(payload, aiProfile, concertInfo),
          concertInfo,
          config.qqMusic
        )
      : null
    const qqPlaylist = musicResult ? musicResultToPlaylist(musicResult, aiProfile.emotionTags) : []
    const profile = musicResult && qqPlaylist.length > 0
      ? attachPlaylistToAiProfile(
          aiProfile,
          qqPlaylist,
          musicResult.fallbackUsed
            ? aiProfile.custody
            : 'QQ音乐演唱会纪念夹'
        )
      : aiProfile
    const provider = musicResult?.source === 'qq-music'
      ? {
          ...qqMusicAiProvider,
          musicProviderLabel: musicResult.provider.label,
          musicFallbackUsed: musicResult.fallbackUsed,
        }
      : musicResult
        ? {
            ...openAiProvider,
            musicProviderLabel: musicResult.provider.label,
            musicFallbackUsed: musicResult.fallbackUsed,
          }
        : openAiProvider

    return {
      profile,
      source: 'ai',
      message: provider.description,
      provider,
    }
  } catch (error) {
    return buildQQMusicFallbackResult(
      fallbackProfile,
      concertInfo,
      evidences,
      config,
      describeAnalysisError(error)
    )
  }
}
