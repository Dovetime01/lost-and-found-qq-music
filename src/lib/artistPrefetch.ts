import {
  queryQQMusicSinger,
  searchQQMusicSongs,
  type MusicSinger,
  type MusicTrack,
  type QQMusicConfig,
} from './musicRecommendation.ts'
import { songs, type Song } from './songs.ts'

export interface ArtistPrefetchResult {
  artist: string
  singerMid: string | null
  singerId: string | null
  topTracks: MusicTrack[]
  source: 'qq-music' | 'fallback'
  ready: true
}

export interface ArtistCatalogSessionState {
  status: 'idle' | 'loading' | 'ready'
  requestArtist: string
  result: ArtistPrefetchResult | null
}

export interface ArtistPrefetchDependencies {
  querySinger: (artist: string, config: QQMusicConfig) => Promise<MusicSinger | null>
  searchSongs: (artist: string, config: QQMusicConfig) => Promise<MusicTrack[]>
}

const defaultDependencies: ArtistPrefetchDependencies = {
  querySinger: queryQQMusicSinger,
  searchSongs: searchQQMusicSongs,
}

export function normalizeArtistPrefetchInput(value: unknown) {
  if (typeof value !== 'string') return null
  const artist = value.trim()
  if (!artist || artist.includes('待确认')) return null
  return artist
}

export function startArtistPrefetch(artist: string): ArtistCatalogSessionState {
  return {
    status: 'loading',
    requestArtist: artist.trim(),
    result: null,
  }
}

export function finishArtistPrefetch(
  state: ArtistCatalogSessionState,
  result: ArtistPrefetchResult
): ArtistCatalogSessionState {
  if (state.requestArtist !== result.artist) return state
  return {
    status: 'ready',
    requestArtist: state.requestArtist,
    result,
  }
}

function normalizeMatchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, '')
}

function uniqueTracks(tracks: MusicTrack[]) {
  const ids = new Set<string>()
  const titles = new Set<string>()
  return tracks.filter((track) => {
    const titleKey = `${normalizeMatchText(track.title)}:${normalizeMatchText(track.artist)}`
    if (ids.has(track.id) || titles.has(titleKey)) return false
    ids.add(track.id)
    titles.add(titleKey)
    return true
  })
}

function localSongToTrack(song: Song): MusicTrack {
  return {
    id: `local-${song.id}`,
    title: song.title,
    artist: song.artist,
    album: song.album ?? song.chapter,
    duration: song.duration,
    coverUrl: song.coverUrl ?? '',
    playUrl: song.playUrl ?? '',
    tryUrl: song.tryUrl,
    qqMusicUrl: song.qqMusicUrl ?? `https://y.qq.com/n/ryqq/search?w=${encodeURIComponent(`${song.title} ${song.artist}`)}`,
    tags: song.tags,
    reason: song.reason,
  }
}

function localFallbackTracks(artist: string) {
  const normalizedArtist = normalizeMatchText(artist)
  const preferred = songs.filter((song) => normalizeMatchText(song.artist) === normalizedArtist)
  return uniqueTracks([...preferred, ...songs].map(localSongToTrack)).slice(0, 10)
}

export async function prefetchArtistCatalog(
  artist: string,
  config: QQMusicConfig = {},
  dependencies: ArtistPrefetchDependencies = defaultDependencies
): Promise<ArtistPrefetchResult> {
  const normalizedArtist = artist.trim()
  if (!normalizedArtist || normalizedArtist.includes('待确认')) {
    return {
      artist: normalizedArtist,
      singerMid: null,
      singerId: null,
      topTracks: localFallbackTracks(normalizedArtist),
      source: 'fallback',
      ready: true,
    }
  }

  const [singerResult, tracksResult] = await Promise.allSettled([
    dependencies.querySinger(normalizedArtist, config),
    dependencies.searchSongs(normalizedArtist, config),
  ])
  const singer = singerResult.status === 'fulfilled' ? singerResult.value : null
  const rawTracks = tracksResult.status === 'fulfilled' ? tracksResult.value : []
  const matched = uniqueTracks(rawTracks).filter((track) => {
    const expected = normalizeMatchText(normalizedArtist)
    const actual = normalizeMatchText(track.artist)
    return actual.includes(expected) || expected.includes(actual)
  })
  const qqTracks = (matched.length > 0 ? matched : uniqueTracks(rawTracks)).slice(0, 10)
  const topTracks = qqTracks.length > 0 ? qqTracks : localFallbackTracks(normalizedArtist)

  return {
    artist: normalizedArtist,
    singerMid: singer?.mid ?? null,
    singerId: singer?.id ?? null,
    topTracks,
    source: qqTracks.length > 0 ? 'qq-music' : 'fallback',
    ready: true,
  }
}
