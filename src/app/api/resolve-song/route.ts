import { NextResponse } from 'next/server'
import { enrichTracksWithPlayUrls, searchQQMusicSongs, type MusicTrack } from '@/lib/musicRecommendation'
import type { SongAnchor } from '@/lib/pipelineTypes'
import { qqMusicConfigForRequest } from '@/lib/qqMusicRouteConfig'

export const runtime = 'nodejs'

function normalized(value: string) {
  return value.toLocaleLowerCase().replace(/[\s·・._\-—/\\]+/g, '')
}

function bestQQTrack(tracks: MusicTrack[], title: string, artist: string) {
  const titleKey = normalized(title)
  const artistKey = normalized(artist)
  const score = (track: MusicTrack) =>
    (normalized(track.title) === titleKey ? 4 : normalized(track.title).includes(titleKey) ? 2 : 0)
    + (artistKey && normalized(track.artist).includes(artistKey) ? 3 : 0)
  const best = [...tracks].sort((left, right) => score(right) - score(left))[0]
  return best && score(best) >= 2 ? best : undefined
}

function trackToAnchor(track: MusicTrack): SongAnchor {
  return {
    id: track.id,
    songMid: track.songMid,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    coverUrl: track.coverUrl,
    playUrl: track.playUrl,
    tryUrl: track.tryUrl,
    qqMusicUrl: track.qqMusicUrl,
    source: 'qq-music',
    recognitionSource: 'manual',
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { title?: unknown; artist?: unknown }
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : ''
    const artist = typeof body.artist === 'string' ? body.artist.trim().slice(0, 80) : ''
    if (!title) {
      return NextResponse.json({ error: '请填写歌曲名。' }, { status: 400 })
    }

    const query = [title, artist].filter(Boolean).join(' ')
    const qqConfig = qqMusicConfigForRequest(request)
    const tracks = await searchQQMusicSongs(query, qqConfig)
    const mapped = bestQQTrack(tracks, title, artist) ?? tracks[0]
    if (!mapped) {
      return NextResponse.json({
        anchor: null,
        source: 'manual-no-match',
        message: '未在 QQ 音乐中找到匹配曲目，请检查歌名或歌手后重试。',
      })
    }

    const [hydrated] = await enrichTracksWithPlayUrls([mapped], qqConfig)
    console.info('[resolve-song] mapped', {
      title: hydrated.title,
      artist: hydrated.artist,
      hasPlayUrl: Boolean(hydrated.playUrl),
      hasTryUrl: Boolean(hydrated.tryUrl),
      urlPreview: (hydrated.playUrl || hydrated.tryUrl || '').slice(0, 96) || null,
    })

    return NextResponse.json({
      anchor: trackToAnchor(hydrated),
      source: 'manual+qq-music',
      message: '已根据手动输入映射到 QQ 音乐曲目。',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Song resolve failed.'
    return NextResponse.json({
      anchor: null,
      source: 'fallback',
      message: message.slice(0, 180),
    }, { status: 500 })
  }
}
