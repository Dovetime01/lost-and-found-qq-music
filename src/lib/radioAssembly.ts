import type { ConcertInfo } from './analysis.ts'
import type { ArtistPrefetchResult } from './artistPrefetch.ts'
import {
  getSimilarQQMusicSongs,
  getQQMusicSingerTrackAtPercentile,
  isUsableIntentTrack,
  mapEmotionTagToTrackType,
  enrichTracksWithPlayUrls,
  searchQQMusicByIntent,
  searchQQMusicSongs,
  type MusicTrack,
  type QQMusicConfig,
} from './musicRecommendation.ts'
import type {
  MultimodalAnalysisResult,
  RadioPlaylistResult,
  RadioStage,
  RadioStep,
  SongAnchor,
} from './pipelineTypes.ts'
import { songs } from './songs.ts'

export interface RadioAssemblyInput {
  anchor?: SongAnchor | null
  artistCatalog?: ArtistPrefetchResult | null
  multimodal?: MultimodalAnalysisResult | null
  emotionTags?: string[]
  concertInfo: ConcertInfo
}

export interface RadioAssemblyConfig {
  qqMusic?: QQMusicConfig
  apiKey?: string
  baseUrl?: string
  model?: string
  fetcher?: typeof fetch
  timeoutMs?: number
}

export interface RadioDependencies {
  similar: typeof getSimilarQQMusicSongs
  intent: typeof searchQQMusicByIntent
  search: typeof searchQQMusicSongs
  coldTrack: typeof getQQMusicSingerTrackAtPercentile
}

const dependencies: RadioDependencies = {
  similar: getSimilarQQMusicSongs,
  intent: searchQQMusicByIntent,
  search: searchQQMusicSongs,
  coldTrack: getQQMusicSingerTrackAtPercentile,
}

const stages: Array<{ stage: RadioStage; chapter: string; label: string; defaultReason: string }> = [
  {
    stage: 'liveWarmth',
    chapter: '现场余温',
    label: '先留住散场后的温度',
    defaultReason: '从现场识别出的歌曲开始，保留散场后的第一层余温。',
  },
  {
    stage: 'emotionResonance',
    chapter: '情绪共振',
    label: '接住心里最响的回声',
    defaultReason: '由现场曲目延伸出的相似旋律，接住心里最响的那层回声。',
  },
  {
    stage: 'crowdLoop',
    chapter: '人群循环',
    label: '把万人合唱重新播放',
    defaultReason: '回到这位艺人最常被传唱的热门曲目，把万人合唱再循环一次。',
  },
  {
    stage: 'longUnheard',
    chapter: '久未听见',
    label: '找回很久没听的自己',
    defaultReason: '从这位艺人热度约七成位置挑出一首偏冷门的作品，让熟悉的声线长出新的感受。',
  },
  {
    stage: 'backToReality',
    chapter: '回到现实',
    label: '陪你平稳落回日常',
    defaultReason: '在这位艺人的作品里，按当下情绪选一首送你回现实的歌。',
  },
]

const SUBSTITUTE_ANCHOR_REASON = '那晚的旋律里，藏着这首歌的回声。'

function normalizeArtistKey(value: string) {
  return value.toLocaleLowerCase().replace(/[\s·・._\-—/\\]+/g, '')
}

function isSameArtist(track: MusicTrack, artist: string) {
  const expected = normalizeArtistKey(artist)
  // Unknown / placeholder artists must NOT match everything — that floods Mayday locals.
  if (!expected || expected.includes('待确认')) return false
  const actual = normalizeArtistKey(track.artist)
  return Boolean(actual) && (actual.includes(expected) || expected.includes(actual))
}

function anchorTrack(anchor?: SongAnchor | null): MusicTrack | null {
  if (!anchor?.title || !anchor.artist) return null
  return {
    id: anchor.id ?? anchor.songMid ?? `anchor-${anchor.title}-${anchor.artist}`,
    songMid: anchor.songMid,
    title: anchor.title,
    artist: anchor.artist,
    album: anchor.album ?? '现场识曲',
    duration: anchor.duration ?? '3:30',
    coverUrl: anchor.coverUrl ?? '',
    playUrl: anchor.playUrl ?? '',
    tryUrl: anchor.tryUrl,
    qqMusicUrl: anchor.qqMusicUrl ?? '',
    tags: [],
    reason: stages[0].defaultReason,
  }
}

function localTracks(artist: string): MusicTrack[] {
  const preferred = songs.filter((song) => isSameArtist({
    id: String(song.id),
    title: song.title,
    artist: song.artist,
    album: '',
    duration: '',
    coverUrl: '',
    playUrl: '',
    qqMusicUrl: '',
    tags: [],
    reason: '',
  }, artist))
  // Never spill the Mayday/demo catalog into another artist's radio.
  const knownArtist = Boolean(artist) && !artist.includes('待确认')
  const pool = preferred.length > 0
    ? preferred
    : knownArtist
      ? []
      : songs
  return pool.map((song) => ({
    id: `local-${song.id}`,
    title: song.title,
    artist: song.artist,
    album: song.album ?? song.chapter,
    duration: song.duration,
    coverUrl: song.coverUrl ?? '',
    playUrl: song.playUrl ?? '',
    tryUrl: song.tryUrl,
    qqMusicUrl: song.qqMusicUrl
      ?? `https://y.qq.com/n/ryqq/search?w=${encodeURIComponent(`${song.title} ${song.artist}`)}`,
    tags: song.tags,
    reason: song.reason,
  }))
}

function key(track: MusicTrack) {
  return `${track.title}:${track.artist}`.toLocaleLowerCase().replace(/\s+/g, '')
}

function unique(tracks: Array<MusicTrack | null | undefined>) {
  const ids = new Set<string>()
  const names = new Set<string>()
  return tracks.filter((track): track is MusicTrack => {
    if (!track) return false
    const name = key(track)
    if (ids.has(track.id) || names.has(name)) return false
    ids.add(track.id)
    names.add(name)
    return true
  })
}

function withReason(track: MusicTrack, reason: string): MusicTrack {
  return { ...track, reason }
}

/**
 * Strict five-step mapping from the product plan:
 * ① identified anchor (or artist hot-track substitute)
 * ② similar songs by song_id/mid
 * ③ concert artist hot tracks
 * ④ colder same-artist track (~70% popularity), excluding used songs
 * ⑤ emotion intent (music_skill)
 */
function chooseFiveSteps(input: {
  artist: string
  anchor: MusicTrack | null
  similar: MusicTrack[]
  catalog: MusicTrack[]
  cold: MusicTrack[]
  intent: MusicTrack[]
  local: MusicTrack[]
}) {
  const used = new Set<string>()
  const take = (...pools: MusicTrack[][]) => {
    for (const pool of pools) {
      const track = pool.find((candidate) => !used.has(key(candidate)))
      if (track) {
        used.add(key(track))
        return track
      }
    }
    return null
  }

  const knownArtist = Boolean(input.artist) && !input.artist.includes('待确认')
  const artistCatalog = unique(input.catalog.filter((track) => isSameArtist(track, input.artist)))
  const artistLocal = unique(input.local.filter((track) => isSameArtist(track, input.artist)))
  const artistPool = unique([...artistCatalog, ...artistLocal])
  const coldPool = unique(
    input.cold.filter((track) => isSameArtist(track, input.artist))
  )
  // Cross-artist filler only when concert artist is unknown.
  const looseLocal = knownArtist ? [] : input.local

  let substituteAnchor = false
  let step1 = input.anchor
  if (!step1) {
    step1 = take(artistCatalog, artistPool, looseLocal)
    substituteAnchor = Boolean(step1)
  } else {
    used.add(key(step1))
  }
  if (!step1) return []

  // ② similar-song API first; if empty, stay on the concert artist.
  const step2 = take(input.similar, artistCatalog, artistPool)
  // ③ artist hot tracks only.
  const step3 = take(artistCatalog, artistPool)
  // ④ colder same-artist track around the 70th popularity percentile.
  const step4 = take(coldPool, artistCatalog.slice().reverse(), artistPool)
    ?? take(input.similar.filter((track) => isSameArtist(track, input.artist)))
  // ⑤ emotion intent stays on the concert artist (Singer + TrackType).
  const intentSameArtist = unique(
    input.intent.filter((track) => isSameArtist(track, input.artist))
  )
  const step5 = take(intentSameArtist, artistPool, artistLocal)

  const slots: Array<MusicTrack | null> = [step1, step2, step3, step4, step5]
  for (let index = 0; index < 5; index += 1) {
    if (slots[index]) continue
    const preferSameArtist = index === 0 || index === 2 || index === 3 || index === 4
    if (knownArtist || preferSameArtist) {
      slots[index] = take(artistPool, artistLocal, intentSameArtist)
        ?? take(input.similar.filter((track) => isSameArtist(track, input.artist)))
    } else {
      slots[index] = take(input.intent, artistPool, input.similar, looseLocal)
    }
  }

  const selected = slots.filter((track): track is MusicTrack => Boolean(track))
  while (selected.length < 5) {
    const filler = knownArtist
      ? take(artistPool, artistLocal, intentSameArtist)
      : take(artistPool, artistLocal, input.intent, input.similar, looseLocal)
    if (!filler) break
    selected.push(filler)
  }

  return selected.slice(0, 5).map((track, index) => {
    if (index === 0 && substituteAnchor) return withReason(track, SUBSTITUTE_ANCHOR_REASON)
    if (index === 3) return withReason(track, stages[3].defaultReason)
    if (track.reason && !track.reason.startsWith('根据「')) return track
    return withReason(track, stages[index]?.defaultReason ?? track.reason)
  })
}

function toStep(track: MusicTrack, index: number): RadioStep {
  const stage = stages[index]
  return {
    id: track.id,
    stage: stage.stage,
    chapter: stage.chapter,
    title: track.title,
    artist: track.artist,
    duration: track.duration,
    reason: track.reason || stage.defaultReason,
    playUrl: track.playUrl,
    tryUrl: track.tryUrl,
    qqMusicUrl: track.qqMusicUrl,
    coverUrl: track.coverUrl,
    source: track.id.startsWith('local-') ? 'local-fallback' : 'qq-music',
  }
}

function copyFallback(steps: RadioStep[], emotionTags: string[]) {
  const mood = emotionTags.slice(0, 2).join('与') || '余温'
  const first = steps[0]
  const introCopy = first
    ? `散场以后，先别急着把那一晚关掉。就从《${first.title}》留下的${mood}出发，让接下来的五段旋律依次接住人海回声、旧日心事，再陪你稳稳回到今天。`
    : '散场以后，先别急着把那一晚关掉。让接下来的旋律接住现场余温、人海回声与旧日心事，再陪你慢慢走回今天，把真实感受留在归途。'
  const recommendLines = steps.map((step, index) =>
    [
      '先把现场最后一束光留住',
      '让这段旋律接住心里回声',
      '把人群里的合唱再循环一次',
      '听见那个久未出现的自己',
      '最后陪你平稳走回日常',
    ][index] ?? `沿着《${step.title}》继续往前`
  )
  return { introCopy: introCopy.slice(0, 80), recommendLines }
}

function parseCopy(content: string) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const match = cleaned.match(/\{[\s\S]*\}/)
  const parsed = JSON.parse(match?.[0] ?? cleaned) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid radio copy')
  return parsed as Record<string, unknown>
}

async function generateCopy(
  steps: RadioStep[],
  emotionTags: string[],
  concertInfo: ConcertInfo,
  config: RadioAssemblyConfig
) {
  const fallback = copyFallback(steps, emotionTags)
  if (!config.apiKey || !config.model) return { ...fallback, fallbackUsed: true }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 10_000)
  try {
    const baseUrl = (config.baseUrl ?? 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')
    const response = await (config.fetcher ?? fetch)(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.4,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            '只输出 JSON：introCopy 为50-80个中文字符；recommendLines 为5条，每条10-20个中文字符。',
            `演出：${JSON.stringify(concertInfo)}`,
            `情绪：${emotionTags.join('、')}`,
            `五段歌单：${JSON.stringify(steps.map(({ chapter, title, artist }) => ({ chapter, title, artist })))}`,
          ].join('\n'),
        }],
      }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Radio copy failed with status ${response.status}`)
    const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error('Radio copy response is empty')
    const payload = parseCopy(content)
    const intro = typeof payload.introCopy === 'string' ? payload.introCopy.trim() : ''
    const lines = Array.isArray(payload.recommendLines)
      ? payload.recommendLines.filter((line): line is string => typeof line === 'string').map((line) => line.trim())
      : []
    if (intro.length < 50 || lines.length !== 5 || lines.some((line) => line.length < 10)) {
      throw new Error('Radio copy length is invalid')
    }
    return {
      introCopy: intro.slice(0, 80),
      recommendLines: lines.map((line) => line.slice(0, 20)),
      fallbackUsed: false,
    }
  } catch {
    return { ...fallback, fallbackUsed: true }
  } finally {
    clearTimeout(timeout)
  }
}

function similarReference(anchor?: SongAnchor | null) {
  if (!anchor) return null
  if (anchor.songMid) return { songMid: anchor.songMid }
  if (anchor.id && /^\d+$/.test(anchor.id)) return { songId: anchor.id }
  if (anchor.id && !anchor.id.startsWith('qq-') && !anchor.id.startsWith('local-') && !anchor.id.startsWith('anchor-')) {
    return { songMid: anchor.id }
  }
  return null
}

export async function assembleRadio(
  input: RadioAssemblyInput,
  config: RadioAssemblyConfig = {},
  deps: RadioDependencies = dependencies
): Promise<RadioPlaylistResult> {
  const tags = input.emotionTags?.length
    ? input.emotionTags
    : input.multimodal?.emotionTags?.length
      ? input.multimodal.emotionTags
      : ['怀旧', '温柔']
  const qqConfig = config.qqMusic ?? {}
  const concertArtist = input.concertInfo.artist.trim()
  const anchorArtist = input.anchor?.artist?.trim() ?? ''
  // Prefer ticket OCR artist; if missing, fall back to the recognized song artist.
  const artist = (concertArtist && !concertArtist.includes('待确认')
    ? concertArtist
    : anchorArtist) || concertArtist
  const identified = anchorTrack(input.anchor)
  const reference = similarReference(input.anchor)

  console.info('[归途电台] assemble start', {
    artist: artist || null,
    concertArtist: concertArtist || null,
    anchorArtist: anchorArtist || null,
    anchor: identified
      ? { title: identified.title, artist: identified.artist, songMid: identified.songMid ?? null, id: identified.id }
      : null,
    similarReference: reference,
    catalogPrefetch: {
      source: input.artistCatalog?.source ?? null,
      trackCount: input.artistCatalog?.topTracks?.length ?? 0,
      singerMid: input.artistCatalog?.singerMid ?? null,
      singerId: input.artistCatalog?.singerId ?? null,
    },
    multimodal: {
      fallbackUsed: input.multimodal?.status?.fallbackUsed ?? null,
      source: input.multimodal?.status?.source ?? null,
      provider: input.multimodal?.status?.provider ?? null,
      emotionTags: tags,
      message: input.multimodal?.status?.message ?? null,
    },
  })

  let catalog = unique(
    (input.artistCatalog?.topTracks ?? []).filter((track) => isSameArtist(track, artist))
  )
  // If prefetch returned mixed/empty results, refresh artist hot tracks via search once.
  if (catalog.length < 3 && artist && !artist.includes('待确认')) {
    try {
      const searchedArtist = await deps.search(artist, qqConfig)
      catalog = unique([
        ...catalog,
        ...searchedArtist.filter((track) => isSameArtist(track, artist)),
      ]).slice(0, 12)
      console.info('[归途电台] ③ artist search refresh', {
        query: artist,
        returned: searchedArtist.length,
        sameArtist: catalog.length,
        titles: catalog.slice(0, 5).map((track) => track.title),
      })
    } catch (error) {
      console.warn('[归途电台] ③ artist search failed', {
        artist,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const emotionTag = tags[0] ?? '温柔'
  const intentRequest = artist && !artist.includes('待确认')
    ? { emotionTag, artist }
    : emotionTag
  const [similarResult, intentResult] = await Promise.allSettled([
    reference ? deps.similar(reference, true, qqConfig) : Promise.resolve([]),
    deps.intent(intentRequest, qqConfig),
  ])
  if (similarResult.status === 'rejected') {
    console.warn('[归途电台] ② similar song API failed', {
      reference,
      message: similarResult.reason instanceof Error
        ? similarResult.reason.message
        : String(similarResult.reason),
    })
  }
  if (intentResult.status === 'rejected') {
    console.warn('[归途电台] ⑤ music_skill failed', {
      intentRequest,
      message: intentResult.reason instanceof Error
        ? intentResult.reason.message
        : String(intentResult.reason),
    })
  }
  const similar = unique(similarResult.status === 'fulfilled' ? similarResult.value : [])
  let intent = unique(
    (intentResult.status === 'fulfilled' ? intentResult.value : [])
      .filter(isUsableIntentTrack)
      .filter((track) => !artist || artist.includes('待确认') || isSameArtist(track, artist))
  )
  console.info('[归途电台] ②⑤ API results', {
    similarCount: similar.length,
    similarTitles: similar.slice(0, 5).map((track) => `${track.title}-${track.artist}`),
    intentCount: intent.length,
    intentTitles: intent.slice(0, 5).map((track) => `${track.title}-${track.artist}`),
    skippedSimilar: !reference,
  })
  // music_skill may return empty or junk; fall back to same-artist mood search.
  if (intent.length === 0 && artist && !artist.includes('待确认')) {
    const mood = mapEmotionTagToTrackType(emotionTag)
    try {
      const searched = await deps.search(`${artist} ${mood}`, qqConfig)
      intent = unique(
        searched
          .filter(isUsableIntentTrack)
          .filter((track) => isSameArtist(track, artist))
      ).slice(0, 8)
      console.info('[归途电台] ⑤ mood search fallback', {
        query: `${artist} ${mood}`,
        returned: searched.length,
        usableSameArtist: intent.length,
      })
    } catch (error) {
      console.warn('[归途电台] ⑤ mood search failed', {
        artist,
        mood,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  const local = localTracks(artist)

  const provisionalUsed = unique([identified, ...catalog.slice(0, 2), ...similar.slice(0, 1)])
  const singerMid = input.artistCatalog?.singerMid ?? undefined
  const singerId = input.artistCatalog?.singerId ?? undefined
  let coldTrack: MusicTrack | null = null
  if (singerMid || singerId) {
    try {
      coldTrack = await deps.coldTrack(
        { id: singerId ?? undefined, mid: singerMid },
        {
          percentile: 0.7,
          exclude: provisionalUsed.filter(Boolean) as MusicTrack[],
          config: qqConfig,
        }
      )
      console.info('[归途电台] ④ cold track', {
        singerMid: singerMid ?? null,
        singerId: singerId ?? null,
        title: coldTrack?.title ?? null,
        artist: coldTrack?.artist ?? null,
      })
    } catch (error) {
      console.warn('[归途电台] ④ cold track failed', {
        singerMid: singerMid ?? null,
        singerId: singerId ?? null,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  } else {
    console.warn('[归途电台] ④ skipped — missing singerMid/singerId from artist prefetch')
  }
  const cold = coldTrack ? [withReason(coldTrack, stages[3].defaultReason)] : []

  // Spec backup: when recognition fails, ① uses the hottest cached artist track.
  let tracks = chooseFiveSteps({
    artist,
    anchor: identified,
    similar,
    catalog,
    cold,
    intent,
    local,
  })
  // Absolute last resort only: never invent Mayday mid-list for another artist,
  // but keep demo continuity when every QQ pool is empty.
  if (tracks.length === 0) {
    console.warn('[归途电台] artist pools empty — demo local catalog last resort')
    tracks = chooseFiveSteps({
      artist: '',
      anchor: identified,
      similar,
      catalog,
      cold,
      intent,
      local: localTracks(''),
    })
  }
  tracks = await enrichTracksWithPlayUrls(tracks, qqConfig)
  const playlist = tracks.slice(0, 5).map(toStep)
  const copy = await generateCopy(playlist, tags, input.concertInfo, config)
  const usedLocal = playlist.some((step) => step.source === 'local-fallback')
  const externalSucceeded = Boolean(identified)
    || similar.length > 0
    || intent.length > 0
    || catalog.length > 0
  // Song-level fallback only. Copy LLM template fallback is reported separately in message.
  const fallbackUsed = usedLocal || !externalSucceeded
  const recommendLines = copy.recommendLines.slice(0, playlist.length)
  const statusMessage = [
    usedLocal ? '部分曲目使用本地曲库补足五段结构。' : '',
    !externalSucceeded ? 'QQ 音乐接口未返回可用曲目，已降级。' : '',
    !usedLocal && externalSucceeded && catalog.length === 0 && similar.length === 0
      ? '艺人热门/相似歌接口为空，已尽量用识别锚点与意图结果组装。'
      : '',
    copy.fallbackUsed ? '电台文案使用本地模板（豆包文案未成功）。' : '',
  ].filter(Boolean).join(' ') || undefined

  console.info('[归途电台] assemble done', {
    fallbackUsed,
    copyFallbackUsed: copy.fallbackUsed,
    usedLocal,
    poolSizes: {
      catalog: catalog.length,
      similar: similar.length,
      cold: cold.length,
      intent: intent.length,
      local: local.length,
    },
    steps: playlist.map((step) => ({
      stage: step.stage,
      title: step.title,
      artist: step.artist,
      source: step.source,
      hasPlayUrl: Boolean(step.playUrl),
      hasTryUrl: Boolean(step.tryUrl),
    })),
  })

  return {
    playlist,
    introCopy: copy.introCopy,
    recommendLines,
    status: {
      source: externalSucceeded ? 'qq-music' : 'fallback',
      provider: externalSucceeded
        ? (copy.fallbackUsed ? 'QQ Music + local-copy' : 'QQ Music + Doubao')
        : 'local-catalog',
      fallbackUsed,
      message: statusMessage,
    },
    intro: copy.introCopy,
    recommendLine: recommendLines.join('；'),
    steps: playlist,
  }
}
