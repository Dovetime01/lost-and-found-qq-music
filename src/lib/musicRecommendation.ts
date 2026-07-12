import type { ConcertInfo } from './analysis.ts'
import { recommendSongs, songs, type Song } from './songs.ts'
import { createHmac } from 'node:crypto'

export interface MemoryProfileDraft {
  emotionTags: string[]
  themes: string[]
  lostItem: string
  foundLocation: string
  note: string
  narrativeLines: string[]
  musicQueries: string[]
}

export interface MusicTrack {
  id: string
  songMid?: string
  title: string
  artist: string
  album: string
  duration: string
  coverUrl: string
  playUrl: string
  tryUrl?: string
  vip?: boolean
  qqMusicUrl: string
  tags: string[]
  reason: string
}

export interface MusicSinger {
  id?: string
  mid: string
  name: string
}

export interface MusicRecommendationProvider {
  label: string
  connected: boolean
  description: string
}

export type MusicRecommendationSource = 'qq-music' | 'fallback'

export interface MusicRecommendationResult {
  tracks: MusicTrack[]
  source: MusicRecommendationSource
  provider: MusicRecommendationProvider
  fallbackUsed: boolean
}

export interface QQMusicConfig {
  appId?: string
  appKey?: string
  baseUrl?: string
  openAppId?: string
  openId?: string
  accessToken?: string
  deviceId?: string
  clientIp?: string
  loginType?: string
  fetcher?: typeof fetch
}

interface RawTrack {
  id?: unknown
  mid?: unknown
  songmid?: unknown
  title?: unknown
  name?: unknown
  songname?: unknown
  artist?: unknown
  singer?: unknown
  album?: unknown
  albumname?: unknown
  duration?: unknown
  interval?: unknown
  coverUrl?: unknown
  cover_url?: unknown
  playUrl?: unknown
  play_url?: unknown
  qqMusicUrl?: unknown
  qq_music_url?: unknown
  url?: unknown
  song_id?: unknown
  song_mid?: unknown
  song_name?: unknown
  song_title?: unknown
  singer_name?: unknown
  author?: unknown
  author_name?: unknown
  album_name?: unknown
  album_pic?: unknown
  album_pic_150x150?: unknown
  album_pic_300x300?: unknown
  album_pic_500x500?: unknown
  song_play_time?: unknown
  song_h5_url?: unknown
  song_play_url?: unknown
  song_play_url_standard?: unknown
  song_play_url_hq?: unknown
  song_play_url_sq?: unknown
  try_30s_url?: unknown
  vip?: unknown
}

const fallbackProvider: MusicRecommendationProvider = {
  label: '本地兜底曲库',
  connected: false,
  description: '当前未连接 QQ 音乐 API，使用本地曲库保持演示稳定。',
}

const qqMusicProvider: MusicRecommendationProvider = {
  label: 'QQ音乐曲库',
  connected: true,
  description: '已连接 QQ 音乐适配层，推荐结果来自曲库搜索。',
}

function buildFallbackProvider(reason?: string): MusicRecommendationProvider {
  return {
    ...fallbackProvider,
    description: reason
      ? `${fallbackProvider.description} QQ 音乐回退原因：${reason}`
      : fallbackProvider.description,
  }
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    const normalized = asString(value)
    if (normalized) return normalized
  }
  return ''
}

function normalizeArtist(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return asString((item as { name?: unknown }).name)
        }
        return ''
      })
      .filter(Boolean)
      .join(' / ')
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return asString((value as { name?: unknown }).name)
  }

  return asString(value)
}

function normalizeDuration(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const minutes = Math.floor(value / 60)
    const seconds = Math.floor(value % 60)
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }
  return asString(value, '3:30')
}

function normalizeTrack(raw: RawTrack, index: number, query: string): MusicTrack | null {
  const title = asString(raw.title ?? raw.name ?? raw.songname ?? raw.song_name ?? raw.song_title)
  const artist = normalizeArtist(raw.artist ?? raw.singer ?? raw.singer_name ?? raw.author ?? raw.author_name)
  if (!title || !artist) return null

  const id = asString(raw.id ?? raw.mid ?? raw.songmid ?? raw.song_id ?? raw.song_mid, `qq-${index}-${title}`)
  const qqMusicUrl = asString(
    raw.qqMusicUrl ?? raw.qq_music_url ?? raw.song_h5_url ?? raw.url,
    `https://y.qq.com/n/ryqq/search?w=${encodeURIComponent(`${title} ${artist}`)}`
  )

  const playUrl = firstNonEmptyString(
    raw.playUrl,
    raw.play_url,
    raw.song_play_url,
    raw.song_play_url_standard,
    raw.song_play_url_hq,
    raw.song_play_url_sq
  )
  const tryUrl = firstNonEmptyString(raw.try_30s_url)

  return {
    id,
    songMid: asString(raw.mid ?? raw.songmid ?? raw.song_mid) || undefined,
    title,
    artist,
    album: asString(raw.album ?? raw.albumname ?? raw.album_name, 'QQ音乐曲库'),
    duration: normalizeDuration(raw.duration ?? raw.interval ?? raw.song_play_time),
    coverUrl: asString(
      raw.coverUrl
        ?? raw.cover_url
        ?? raw.album_pic_300x300
        ?? raw.album_pic_500x500
        ?? raw.album_pic_150x150
        ?? raw.album_pic
    ),
    playUrl,
    tryUrl: tryUrl || undefined,
    vip: Number(raw.vip) === 1,
    qqMusicUrl,
    tags: [],
    reason: `根据「${query}」从 QQ 音乐曲库匹配。`,
  }
}

function extractRawTracks(payload: unknown): RawTrack[] {
  if (Array.isArray(payload)) return payload as RawTrack[]
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []

  const data = payload as {
    tracks?: unknown
    songs?: unknown
    data?: unknown
    list?: unknown
    songlist?: unknown
    song_list?: unknown
    play_command?: unknown
  }
  const nested = data.data && typeof data.data === 'object' && !Array.isArray(data.data)
    ? data.data as {
        tracks?: unknown
        songs?: unknown
        list?: unknown
        songlist?: unknown
        song_list?: unknown
        play_command?: unknown
      }
    : undefined
  const playCommand = (data.play_command ?? nested?.play_command)
  const playList = playCommand && typeof playCommand === 'object' && !Array.isArray(playCommand)
    ? (playCommand as { play_list?: unknown; playlist?: unknown }).play_list
      ?? (playCommand as { play_list?: unknown; playlist?: unknown }).playlist
    : undefined

  const candidates = [
    data.tracks,
    data.songs,
    data.list,
    nested?.tracks,
    nested?.songs,
    nested?.list,
    data.songlist,
    data.song_list,
    nested?.songlist,
    nested?.song_list,
    playList,
  ]

  return candidates.find((candidate): candidate is RawTrack[] => Array.isArray(candidate)) ?? []
}

function hasQQMusicConfig(config: QQMusicConfig) {
  return Boolean(config.appId && config.appKey && config.baseUrl)
}

function createQQMusicSignature(queryString: string, appKey: string, cookie = '') {
  return createHmac('sha256', appKey)
    .update(`${queryString}&cookie=${cookie}`)
    .digest('hex')
    .toLowerCase()
}

function buildQQMusicBaseParams(opiCmd: string, config: QQMusicConfig) {
  const params = new URLSearchParams()
  params.set('opi_cmd', opiCmd)
  params.set('app_id', config.appId!)
  params.set('timestamp', Math.floor(Date.now() / 1000).toString())
  params.set('login_type', config.loginType ?? '6')
  params.set('device_id', config.deviceId ?? 'lost-found-demo-device')

  if (config.clientIp) params.set('client_ip', config.clientIp)
  if (config.openAppId) params.set('qqmusic_open_appid', config.openAppId)
  if (config.openId) params.set('qqmusic_open_id', config.openId)
  if (config.accessToken) params.set('qqmusic_access_token', config.accessToken)

  return params
}

function buildSignedQQMusicRequest(params: URLSearchParams, config: QQMusicConfig) {
  const queryString = params.toString()
  return {
    url: `${config.baseUrl!.replace(/\?+$/, '')}?${queryString}`,
    sign: createQQMusicSignature(queryString, config.appKey!),
  }
}

function buildQQMusicSearchRequest(query: string, config: QQMusicConfig) {
  const params = buildQQMusicBaseParams('fcg_music_custom_search.fcg', config)

  params.set('w', query)
  params.set('p', '1')
  params.set('num', '10')
  params.set('t', '0')

  return buildSignedQQMusicRequest(params, config)
}

export interface SimilarSongReference {
  songId?: string | number
  songMid?: string
}

export interface MusicIntentRequest {
  emotionTag: string
  requestId?: string
  limit?: number
  originalQuestion?: string
}

function requireQQMusicConfig(config: QQMusicConfig) {
  if (!hasQQMusicConfig(config)) throw new Error('QQ Music configuration is incomplete')
}

async function fetchQQMusicTracks(
  params: URLSearchParams,
  query: string,
  operation: string,
  config: QQMusicConfig
) {
  requireQQMusicConfig(config)
  const request = buildSignedQQMusicRequest(params, config)
  const response = await (config.fetcher ?? fetch)(request.url, {
    method: 'GET',
    headers: {
      'X-QYOPI-Sign': request.sign,
      Accept: 'application/json',
    },
  })
  if (!response.ok) throw new Error(`QQ Music ${operation} failed with status ${response.status}`)
  const payload = await response.json()
  describeQQMusicPayloadError(payload, operation)
  return extractRawTracks(payload)
    .map((track, index) => normalizeTrack(track, index, query))
    .filter((track): track is MusicTrack => Boolean(track))
}

export async function getSimilarQQMusicSongs(
  reference: SimilarSongReference | string | number,
  hasRec = false,
  config: QQMusicConfig = {}
) {
  const normalized = typeof reference === 'object'
    ? reference
    : /^\d+$/.test(String(reference))
      ? { songId: reference }
      : { songMid: String(reference) }
  if (!normalized.songId && !normalized.songMid) return []
  const params = buildQQMusicBaseParams('fcg_music_custom_get_similar_song.fcg', config)
  if (normalized.songId !== undefined) params.set('song_id', String(normalized.songId))
  if (normalized.songMid) params.set('song_mid', normalized.songMid)
  params.set('has_rec', hasRec ? '1' : '0')
  return fetchQQMusicTracks(params, '相似歌曲', 'similar songs', config)
}

export async function searchQQMusicByIntent(
  emotionTag: string | MusicIntentRequest,
  config: QQMusicConfig = {}
) {
  const request = typeof emotionTag === 'string'
    ? { emotionTag }
    : emotionTag
  const tag = request.emotionTag.trim()
  if (!tag) return []
  if (!config.openId || !config.accessToken) return []

  const limit = Math.max(1, Math.min(20, Math.floor(request.limit ?? 10)))
  const requestId = request.requestId ?? `lost-found-${Date.now()}`
  const originalQuestion = request.originalQuestion ?? `推荐适合${tag}情绪的歌曲`
  const params = buildQQMusicBaseParams('music_skill', config)
  params.set('opi_protocol_version', '1')
  params.set('cms_type', '0')
  params.set('cmd_params', JSON.stringify({
    app_info: {
      name: 'QQ音乐失物招领处',
      app_id: config.appId,
    },
    request: {
      request_id: requestId,
    },
    original_question: originalQuestion,
    play_item_limit: limit,
    play_item_cnt: limit,
    music_skill_mode: '1',
    intent: {
      name: 'SearchSong',
      slots: [{
        name: 'TrackType',
        value: tag,
        intent_type: 0,
      }],
    },
  }))
  return fetchQQMusicTracks(params, tag, 'music skill', config)
}

function describeQQMusicPayloadError(payload: unknown, operation: string) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('ret' in payload)) return
  if ((payload as { ret?: unknown }).ret === 0) return

  const errorPayload = payload as { ret?: unknown; sub_ret?: unknown; msg?: unknown }
  const detail = [
    `ret=${String(errorPayload.ret)}`,
    errorPayload.sub_ret !== undefined ? `sub_ret=${String(errorPayload.sub_ret)}` : '',
    typeof errorPayload.msg === 'string' && errorPayload.msg ? `msg=${errorPayload.msg}` : '',
  ].filter(Boolean).join(', ')
  throw new Error(`QQ Music ${operation} returned ${detail}`)
}

function extractRawSingers(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const data = payload as { singer_list?: unknown; singers?: unknown; list?: unknown; data?: unknown }
  const nested = data.data && typeof data.data === 'object' && !Array.isArray(data.data)
    ? data.data as { singer_list?: unknown; singers?: unknown; list?: unknown }
    : undefined
  const candidates = [data.singer_list, data.singers, data.list, nested?.singer_list, nested?.singers, nested?.list]
  return candidates.find((candidate): candidate is Array<Record<string, unknown>> => Array.isArray(candidate)) ?? []
}

export async function queryQQMusicSinger(
  artist: string,
  config: QQMusicConfig = {}
): Promise<MusicSinger | null> {
  const normalizedArtist = artist.trim()
  if (!hasQQMusicConfig(config) || !normalizedArtist) return null

  const params = buildQQMusicBaseParams('fcg_music_custom_query_singer_list.fcg', config)
  params.set('singer_name', normalizedArtist)
  params.set('page', '1')
  params.set('num', '10')
  const request = buildSignedQQMusicRequest(params, config)
  const fetcher = config.fetcher ?? fetch
  const response = await fetcher(request.url, {
    method: 'GET',
    headers: { 'X-QYOPI-Sign': request.sign, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`QQ Music singer lookup failed with status ${response.status}`)

  const payload = await response.json()
  describeQQMusicPayloadError(payload, 'singer lookup')
  const singers = extractRawSingers(payload)
    .map((raw) => {
      const id = asString(raw.singer_id ?? raw.id) || undefined
      const mid = asString(raw.singer_mid ?? raw.mid)
      const name = asString(raw.singer_name ?? raw.name)
      return id ? { id, mid, name } : { mid, name }
    })
    .filter((singer) => singer.mid && singer.name)
  return singers.find((singer) => normalizeMatchText(singer.name) === normalizeMatchText(normalizedArtist))
    ?? singers[0]
    ?? null
}

export interface SingerSongsQuery {
  singerId?: string | number
  singerMid?: string
  pageIndex?: number
  numPerPage?: number
  /** 0: by time (default), 1: by popularity/heat */
  order?: 0 | 1
}

export interface SingerSongsPage {
  tracks: MusicTrack[]
  songSum: number
  pageIndex: number
  hasMore: boolean
  singerId?: string
  singerMid?: string
  singerName?: string
}

export async function getQQMusicSingerSongs(
  query: SingerSongsQuery,
  config: QQMusicConfig = {}
): Promise<SingerSongsPage> {
  if (!query.singerId && !query.singerMid) {
    return { tracks: [], songSum: 0, pageIndex: 0, hasMore: false }
  }
  if (!hasQQMusicConfig(config)) {
    return { tracks: [], songSum: 0, pageIndex: 0, hasMore: false }
  }

  const pageIndex = Math.max(0, Math.floor(query.pageIndex ?? 0))
  const numPerPage = Math.max(1, Math.min(50, Math.floor(query.numPerPage ?? 50)))
  const order = query.order === 1 ? 1 : 0
  const params = buildQQMusicBaseParams('fcg_music_custom_get_singer_info.fcg', config)
  if (query.singerMid) {
    params.set('singer_mid', String(query.singerMid))
  } else if (query.singerId !== undefined) {
    params.set('singer_id', String(query.singerId))
  }
  params.set('page_index', String(pageIndex))
  params.set('num_per_page', String(numPerPage))
  params.set('order', String(order))

  const request = buildSignedQQMusicRequest(params, config)
  const response = await (config.fetcher ?? fetch)(request.url, {
    method: 'GET',
    headers: {
      'X-QYOPI-Sign': request.sign,
      Accept: 'application/json',
    },
  })
  if (!response.ok) throw new Error(`QQ Music singer songs failed with status ${response.status}`)
  const payload = await response.json()
  describeQQMusicPayloadError(payload, 'singer songs')

  const root = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {}
  const songSum = Number(root.song_sum)
  const hasMore = Number(root.has_more) === 1
  const singerName = asString(root.singer_name)
  const label = singerName || '歌手歌曲'
  const tracks = extractRawTracks(payload)
    .map((track, index) => normalizeTrack(track, index, label))
    .filter((track): track is MusicTrack => Boolean(track))

  return {
    tracks,
    songSum: Number.isFinite(songSum) && songSum > 0 ? songSum : tracks.length,
    pageIndex,
    hasMore,
    singerId: asString(root.singer_id) || undefined,
    singerMid: asString(root.singer_mid) || undefined,
    singerName: singerName || undefined,
  }
}

function trackIdentity(track: Pick<MusicTrack, 'title' | 'artist'>) {
  return `${track.title}:${track.artist}`.toLocaleLowerCase().replace(/\s+/g, '')
}

/**
 * Pick a less-played track around the given popularity percentile.
 * Uses get_singer_info with order=1 (hottest first); percentile 0.7 ≈ colder songs.
 */
export async function getQQMusicSingerTrackAtPercentile(
  singer: { id?: string | number; mid?: string },
  options: {
    percentile?: number
    exclude?: Array<Pick<MusicTrack, 'id' | 'title' | 'artist'>>
    config?: QQMusicConfig
  } = {}
): Promise<MusicTrack | null> {
  const percentile = Math.min(0.95, Math.max(0.05, options.percentile ?? 0.7))
  const config = options.config ?? {}
  const exclude = new Set(
    (options.exclude ?? []).flatMap((track) => [
      track.id,
      trackIdentity(track),
    ].filter(Boolean))
  )
  const isExcluded = (track: MusicTrack) =>
    exclude.has(track.id) || exclude.has(trackIdentity(track))

  const pageSize = 50
  const firstPage = await getQQMusicSingerSongs({
    singerId: singer.id,
    singerMid: singer.mid,
    pageIndex: 0,
    numPerPage: pageSize,
    order: 1,
  }, config)
  if (!firstPage.tracks.length) return null

  const songSum = Math.max(firstPage.songSum, firstPage.tracks.length)
  const targetIndex = Math.min(
    songSum - 1,
    Math.max(0, Math.floor((songSum - 1) * percentile))
  )
  const pageIndex = Math.floor(targetIndex / pageSize)
  const indexInPage = targetIndex % pageSize
  const page = pageIndex === 0
    ? firstPage
    : await getQQMusicSingerSongs({
      singerId: singer.id,
      singerMid: singer.mid,
      pageIndex,
      numPerPage: pageSize,
      order: 1,
    }, config)

  const pickFrom = (tracks: MusicTrack[], start: number) => {
    for (let distance = 0; distance < tracks.length; distance += 1) {
      for (const index of [start + distance, start - distance]) {
        if (index < 0 || index >= tracks.length) continue
        const candidate = tracks[index]
        if (candidate && !isExcluded(candidate)) return candidate
      }
    }
    return null
  }

  return pickFrom(page.tracks, Math.min(indexInPage, Math.max(0, page.tracks.length - 1)))
    ?? pickFrom(firstPage.tracks, Math.min(
      Math.floor((firstPage.tracks.length - 1) * percentile),
      Math.max(0, firstPage.tracks.length - 1)
    ))
}

function localFallbackTracks(draft: MemoryProfileDraft, concertInfo: ConcertInfo): MusicTrack[] {
  const matchedSongs = recommendSongs(draft.emotionTags, concertInfo.artist)
  const resolvedSongs = matchedSongs.length > 0 ? matchedSongs : songs.slice(0, 8)

  return resolvedSongs.slice(0, 8).map((song) => songToMusicTrack(song, draft))
}

function songToMusicTrack(song: Song, draft: MemoryProfileDraft): MusicTrack {
  return {
    id: `local-${song.id}`,
    title: song.title,
    artist: song.artist,
    album: song.chapter,
    duration: song.duration,
    coverUrl: '',
    playUrl: '',
    qqMusicUrl: `https://y.qq.com/n/ryqq/search?w=${encodeURIComponent(`${song.title} ${song.artist}`)}`,
    tags: song.tags,
    reason: song.reason || `适合「${draft.emotionTags.join(' / ')}」的归途情绪。`,
  }
}

function buildQueries(draft: MemoryProfileDraft, concertInfo: ConcertInfo) {
  const artist = concertInfo.artist.trim()
  const artistQueries = draft.musicQueries
    .map((query) => query.trim())
    .filter(Boolean)
    .map((query) => artist && !query.includes(artist) ? `${artist} ${query}` : query)

  const queries = [
    ...artistQueries,
    artist,
    `${artist} ${draft.emotionTags.join(' ')}`.trim(),
    `${draft.themes.join(' ')} ${draft.emotionTags.join(' ')}`.trim(),
  ]

  return Array.from(new Set(queries.filter((query) => query && !query.includes('待确认')))).slice(0, 5)
}

function normalizeMatchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, '')
}

function isArtistMatched(track: MusicTrack, artist: string) {
  const normalizedArtist = normalizeMatchText(artist)
  if (!normalizedArtist || normalizedArtist.includes('待确认')) return true

  const normalizedTrackArtist = normalizeMatchText(track.artist)
  return normalizedTrackArtist.includes(normalizedArtist) || normalizedArtist.includes(normalizedTrackArtist)
}

export async function searchQQMusicSongs(
  query: string,
  config: QQMusicConfig = {}
): Promise<MusicTrack[]> {
  if (!hasQQMusicConfig(config)) return []

  const fetcher = config.fetcher ?? fetch
  const request = buildQQMusicSearchRequest(query, config)

  const response = await fetcher(request.url, {
    method: 'GET',
    headers: {
      'X-QYOPI-Sign': request.sign,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`QQ Music search failed with status ${response.status}`)
  }

  const payload = await response.json()
  describeQQMusicPayloadError(payload, 'search')

  return extractRawTracks(payload)
    .map((track, index) => normalizeTrack(track, index, query))
    .filter((track): track is MusicTrack => Boolean(track))
}

export async function recommendQQMusicTracks(
  draft: MemoryProfileDraft,
  concertInfo: ConcertInfo,
  config: QQMusicConfig = {}
): Promise<MusicRecommendationResult> {
  if (!hasQQMusicConfig(config)) {
    return {
      tracks: localFallbackTracks(draft, concertInfo),
      source: 'fallback',
      provider: buildFallbackProvider('缺少 QQ_MUSIC_APP_ID / QQ_MUSIC_APP_KEY / QQ_MUSIC_BASE_URL。'),
      fallbackUsed: true,
    }
  }

  try {
    const queries = buildQueries(draft, concertInfo)
    const collected: MusicTrack[] = []
    const relaxedCollected: MusicTrack[] = []

    for (const query of queries) {
      const tracks = await searchQQMusicSongs(query, config)
      tracks.forEach((track) => {
        const target = isArtistMatched(track, concertInfo.artist) ? collected : relaxedCollected
        const duplicated = [...collected, ...relaxedCollected].some(
          (item) => item.id === track.id || `${item.title}-${item.artist}` === `${track.title}-${track.artist}`
        )
        if (!duplicated) {
          target.push({
            ...track,
            tags: draft.emotionTags,
            reason: track.reason || `根据「${query}」和你的现场情绪匹配。`,
          })
        }
      })
      if (collected.length >= 8) break
    }

    const resolvedTracks = collected.length >= 3
      ? collected
      : [...collected, ...relaxedCollected]

    if (resolvedTracks.length === 0) throw new Error('QQ Music returned no tracks')

    return {
      tracks: resolvedTracks.slice(0, 8),
      source: 'qq-music',
      provider: qqMusicProvider,
      fallbackUsed: false,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error'
    return {
      tracks: localFallbackTracks(draft, concertInfo),
      source: 'fallback',
      provider: buildFallbackProvider(reason),
      fallbackUsed: true,
    }
  }
}
