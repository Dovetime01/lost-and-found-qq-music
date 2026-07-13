import { extname } from 'node:path'
import { NextResponse } from 'next/server'
import { recognizeAcrCloudWav, type AcrCloudSongCandidate } from '@/lib/acrcloudRecognition'
import { extractVideoRecognitionWindows, mediaProcessingLimits } from '@/lib/mediaProcessing'
import { searchQQMusicSongs, type MusicTrack } from '@/lib/musicRecommendation'
import type { SongAnchor } from '@/lib/pipelineTypes'
import { qqMusicConfigForRequest } from '@/lib/qqMusicRouteConfig'

export const runtime = 'nodejs'
export const maxDuration = 60
// Closer to ACRCloud China North; reduces cold outbound flakiness from US regions.
export const preferredRegion = ['hkg1', 'sin1']

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
    recognitionSource: 'acrcloud',
  }
}

function candidateKey(candidate: AcrCloudSongCandidate) {
  return `${normalized(candidate.title)}:${normalized(candidate.artist)}`
}

function artistMatches(candidate: AcrCloudSongCandidate, expectedArtist: string) {
  if (!expectedArtist) return false
  const recognized = normalized(candidate.artist)
  return recognized.includes(expectedArtist) || expectedArtist.includes(recognized)
}

function isTrustedCandidate(candidate: AcrCloudSongCandidate, expectedArtist = '') {
  if (!candidate.title || !candidate.artist) return false
  const confidence = candidate.confidence ?? 0
  // AVR music scores are often 40–90 on phone/screen recordings; humming scores
  // tend to be higher when they hit. Keep humming stricter, music more permissive
  // when the ticket artist aligns with the recognized artist.
  if (candidate.recognitionType === 'music') {
    if (confidence >= 50) return true
    return confidence >= 35 && artistMatches(candidate, expectedArtist)
  }
  return confidence >= 60
}

function sanitizeDetail(message: string) {
  return message
    .replace(/[A-Za-z]:\\[^\s]+/g, '[path]')
    .replace(/\/(?:var|tmp|Users|home)\/[^\s]+/g, '[path]')
    .slice(0, 180)
}

function envProtocol(): 'http' | 'https' | undefined {
  const value = process.env.ACRCLOUD_PROTOCOL?.trim().toLowerCase()
  if (value === 'http' || value === 'https') return value
  return undefined
}

export async function POST(request: Request) {
  const startedAt = Date.now()
  let stage = 'init'
  try {
    stage = 'parse-form'
    const form = await request.formData()
    const video = form.get('video')
    const durationSeconds = Number(form.get('durationSeconds'))
    const artist = String(form.get('artist') ?? '').trim().slice(0, 100)
    if (!(video instanceof File)) {
      return NextResponse.json({ error: 'video is required.' }, { status: 400 })
    }
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 21_600) {
      return NextResponse.json({ error: 'durationSeconds must be between 0 and 21600.' }, { status: 400 })
    }
    if (video.size <= 0 || video.size > mediaProcessingLimits.maxVideoBytes) {
      return NextResponse.json({ error: 'video size is outside the allowed range.' }, { status: 413 })
    }

    const host = process.env.ACRCLOUD_HOST
    const accessKey = process.env.ACRCLOUD_ACCESS_KEY
    const accessSecret = process.env.ACRCLOUD_ACCESS_SECRET
    console.info('[ACRCloud] identify-song start', {
      vercel: process.env.VERCEL === '1',
      region: process.env.VERCEL_REGION ?? null,
      videoBytes: video.size,
      videoName: video.name,
      durationSeconds,
      artist: artist || null,
      hasHost: Boolean(host),
      hasAccessKey: Boolean(accessKey),
      hasAccessSecret: Boolean(accessSecret),
      protocol: envProtocol() ?? (process.env.VERCEL === '1' ? 'https-first' : 'http-first'),
    })

    if (!host || !accessKey || !accessSecret) {
      stage = 'env'
      throw new Error('Missing ACRCLOUD_HOST / ACRCLOUD_ACCESS_KEY / ACRCLOUD_ACCESS_SECRET')
    }

    stage = 'ffmpeg'
    const extension = extname(video.name) || '.mp4'
    const clips = await extractVideoRecognitionWindows(
      Buffer.from(await video.arrayBuffer()),
      extension,
      durationSeconds,
      undefined,
      // Vercel: one window keeps ffmpeg + identify inside the function budget.
      { maxWindows: process.env.VERCEL === '1' ? 1 : undefined }
    )

    stage = 'acrcloud'
    const windowResults = await Promise.all(
      clips.map(async ({ wav, targetTimeSeconds }, index) => {
        const result = await recognizeAcrCloudWav(wav, {
          host,
          accessKey,
          accessSecret,
          protocol: envProtocol(),
        })
        console.info('[ACRCloud] window result', {
          index,
          targetTimeSeconds,
          wavBytes: wav.length,
          mode: result.mode ?? null,
          candidateCount: result.candidates.length,
          message: result.message ?? null,
        })
        return result
      })
    )
    const expectedArtist = normalized(artist)
    const candidates = windowResults
      .flatMap((result) => result.candidates)
      .filter((candidate, index, list) =>
        list.findIndex((item) => candidateKey(item) === candidateKey(candidate)) === index
      )
      .sort((left, right) => {
        const artistBoost = (candidate: AcrCloudSongCandidate) =>
          artistMatches(candidate, expectedArtist) ? 5 : 0
        const typeBoost = (candidate: AcrCloudSongCandidate) =>
          candidate.recognitionType === 'music' ? 2 : 0
        return ((right.confidence ?? 0) + artistBoost(right) + typeBoost(right))
          - ((left.confidence ?? 0) + artistBoost(left) + typeBoost(left))
      })
    const trustedCandidates = candidates.filter((candidate) =>
      isTrustedCandidate(candidate, expectedArtist)
    )
    console.info('[ACRCloud] recognition result', {
      clipCount: clips.length,
      modes: windowResults.map((result) => result.mode ?? null),
      expectedArtist: artist || null,
      candidates,
      trustedCandidates,
      elapsedMs: Date.now() - startedAt,
    })

    stage = 'qq-music'
    const mappedCandidates = await Promise.all(
      trustedCandidates.slice(0, 3).map(async (candidate) => {
        const tracks = await searchQQMusicSongs(
          `${candidate.title} ${candidate.artist}`.trim(),
          qqMusicConfigForRequest(request)
        ).catch((error) => {
          console.warn('[ACRCloud] QQ Music search failed', {
            title: candidate.title,
            artist: candidate.artist,
            message: error instanceof Error ? error.message : String(error),
          })
          return []
        })
        return bestQQTrack(tracks, candidate.title, candidate.artist)
      })
    )
    const mapped = mappedCandidates.find(Boolean)
    if (mapped) {
      const matchedCandidate = trustedCandidates[0]
      const mode = matchedCandidate?.recognitionType ?? 'music'
      const confidence = matchedCandidate?.confidence
      console.info('[ACRCloud] QQ Music mapping', {
        mode,
        confidence,
        title: mapped.title,
        artist: mapped.artist,
        songMid: mapped.songMid,
        hasPlayUrl: Boolean(mapped.playUrl),
        hasTryUrl: Boolean(mapped.tryUrl),
        elapsedMs: Date.now() - startedAt,
      })
      return NextResponse.json({
        anchor: {
          ...trackToAnchor(mapped),
          confidence,
        },
        candidates,
        source: 'acrcloud+qq-music',
        message: mode === 'humming'
          ? '已通过 ACRCloud 哼唱识别并映射到 QQ 音乐曲目。'
          : '已通过 ACRCloud 音乐指纹识别并映射到 QQ 音乐曲目。',
      })
    }

    console.warn('[ACRCloud] no trusted QQ Music mapping', {
      candidateCount: candidates.length,
      trustedCandidateCount: trustedCandidates.length,
      elapsedMs: Date.now() - startedAt,
    })
    return NextResponse.json({
      anchor: null,
      candidates,
      source: candidates.length ? 'acrcloud-unmapped' : 'acrcloud-no-match',
      message: candidates.length
        ? '识别到候选，但未达到艺人/置信度校验或未能映射到 QQ 音乐曲目。'
        : '未从现场音频中获得可靠歌曲匹配。',
      failureStage: candidates.length ? 'qq-music-or-threshold' : 'acrcloud-no-match',
    })
  } catch (error) {
    const detail = sanitizeDetail(error instanceof Error ? error.message : 'Song recognition failed.')
    console.error('[ACRCloud] recognition failed', {
      stage,
      detail,
      elapsedMs: Date.now() - startedAt,
      vercel: process.env.VERCEL === '1',
      region: process.env.VERCEL_REGION ?? null,
      error,
    })
    return NextResponse.json({
      anchor: null,
      candidates: [],
      source: 'fallback',
      message: '未从现场音频中获得可靠歌曲匹配。',
      failureStage: stage,
      failureDetail: detail,
    })
  }
}
