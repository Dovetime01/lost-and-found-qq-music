'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConcertInfo, EvidenceInput, MemoryProfile } from '@/lib/analysis'
import type { ArtistPrefetchResult } from '@/lib/artistPrefetch'
import type {
  ClaimFormFields,
  EvidenceMediaBundle,
  MultimodalAnalysisResult,
  RadioPlaylistResult,
  RadioStep,
  SongAnchor,
} from '@/lib/pipelineTypes'

type RequestName = 'identify' | 'multimodal' | 'claim' | 'radio' | 'manual'
/** song-ready: 识曲完成，可进听歌页；all-ready: 豆包认领单 + 电台也完成 */
export type PipelineReadiness = 'idle' | 'processing' | 'song-ready' | 'all-ready'

export interface MemoryPipelineState {
  readiness: PipelineReadiness
  anchor: SongAnchor | null
  multimodal: MultimodalAnalysisResult | null
  claim: ClaimFormFields | null
  radio: RadioPlaylistResult | null
  errors: Partial<Record<RequestName, string>>
  needsManualSong: boolean
  identifyMessage: string | null
}

interface StartPipelineInput {
  concertInfo: ConcertInfo
  evidences: EvidenceInput[]
  media: EvidenceMediaBundle
  localProfile: MemoryProfile
  artistCatalog: ArtistPrefetchResult | null | Promise<ArtistPrefetchResult | null>
}

interface PendingContinuation {
  concertInfo: ConcertInfo
  catalog: ArtistPrefetchResult | null
  localProfile: MemoryProfile
  evidences: EvidenceInput[]
  media: EvidenceMediaBundle
}

const INITIAL_STATE: MemoryPipelineState = {
  readiness: 'idle',
  anchor: null,
  multimodal: null,
  claim: null,
  radio: null,
  errors: {},
  needsManualSong: false,
  identifyMessage: null,
}

function readableError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return '请求已取消'
  return error instanceof Error ? error.message : '服务暂时不可用'
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail || `接口返回 ${response.status}`)
  }
  return response.json() as Promise<T>
}

async function settleWithin<T>(value: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeout: number | undefined
  try {
    return await Promise.race([
      value,
      new Promise<T>((resolve) => {
        timeout = window.setTimeout(() => resolve(fallback), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) window.clearTimeout(timeout)
  }
}

function trackToAnchor(
  catalog: ArtistPrefetchResult | null,
  profile: MemoryProfile,
): SongAnchor {
  const track = catalog?.topTracks[0]
  if (track) {
    return {
      id: String(track.id),
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      coverUrl: track.coverUrl,
      playUrl: track.playUrl,
      tryUrl: track.tryUrl,
      qqMusicUrl: track.qqMusicUrl,
      source: catalog?.source ?? 'fallback',
      recognitionSource: 'fallback',
    }
  }
  return {
    id: String(profile.primarySong.id),
    title: profile.primarySong.title,
    artist: profile.primarySong.artist,
    duration: profile.primarySong.duration,
    playUrl: profile.primarySong.playUrl,
    qqMusicUrl: profile.primarySong.qqMusicUrl,
    source: 'local-fallback',
    recognitionSource: 'fallback',
  }
}

function localMultimodal(evidences: EvidenceInput[], profile: MemoryProfile): MultimodalAnalysisResult {
  const claimReason = evidences.map((item) => item.content).filter(Boolean).join('；') || profile.note
  return {
    lostItem: profile.lostItem || '那晚留在现场的自己',
    claimReason: claimReason || '有些感受不会消失，只是暂时留在音乐里。',
    emotionTags: profile.emotionTags.length ? profile.emotionTags : ['忧伤'],
    summary: claimReason,
    dominantEmotion: profile.dominantEmotion || '忧伤',
    modalities: {
      photo: evidences.some((item) => item.type === 'photo'),
      videoFrame: evidences.some((item) => item.type === 'video'),
      voice: evidences.some((item) => item.type === 'audio'),
      text: evidences.some((item) => item.type === 'note'),
      lyrics: evidences.some((item) => item.type === 'lyrics'),
    },
    status: {
      source: 'fallback',
      provider: 'local',
      fallbackUsed: true,
      message: '情绪认领接口不可用，已使用本地默认结果。',
    },
  }
}

function localClaim(profile: MemoryProfile): ClaimFormFields {
  const claimReason = profile.narrativeLines.at(-1) ?? profile.note
  return {
    lostItemName: profile.lostItem,
    lostItem: profile.lostItem,
    foundLocation: profile.foundLocation,
    status: profile.status,
    custody: profile.custody,
    note: claimReason,
    narrativeLines: profile.narrativeLines,
    emotionTags: profile.emotionTags.length ? profile.emotionTags : ['忧伤'],
    emotionIntensity: 5,
    reflection: claimReason,
    claimReason,
    vagueMode: true,
    pipelineStatus: {
      source: 'fallback',
      provider: 'local',
      fallbackUsed: true,
    },
  }
}

function localRadio(
  catalog: ArtistPrefetchResult | null,
  profile: MemoryProfile,
): RadioPlaylistResult {
  const source = catalog?.topTracks.length ? catalog.topTracks : profile.playlist
  const stages: RadioStep['stage'][] = ['liveWarmth', 'emotionResonance', 'crowdLoop', 'longUnheard', 'backToReality']
  const steps: RadioStep[] = source.slice(0, 5).map((track, index) => ({
    id: String(track.id),
    stage: stages[index],
    chapter: ['散场余温', '人海回声', '心事中段', '归途转弯', '日常落点'][index],
    title: track.title,
    artist: track.artist,
    duration: track.duration,
    reason: '沿着这段旋律，把现场的情绪慢慢带回日常。',
    playUrl: track.playUrl,
    tryUrl: track.tryUrl,
    qqMusicUrl: track.qqMusicUrl,
    source: 'source' in track ? track.source : catalog?.source,
  }))
  return {
    playlist: steps,
    introCopy: '散场以后，先别急着把那一晚关掉。',
    recommendLines: [`这五段旋律，会陪你从${profile.dominantEmotion}走回日常。`],
    status: {
      source: 'fallback',
      provider: 'local',
      fallbackUsed: true,
    },
    intro: '散场以后，先别急着把那一晚关掉。',
    recommendLine: `这五段旋律，会陪你从${profile.dominantEmotion}走回日常。`,
    steps,
  }
}

function appendMultimodalForm(
  body: FormData,
  pending: PendingContinuation,
  anchor: SongAnchor | null,
) {
  const { media, concertInfo } = pending
  if (media.photo) {
    const photoName = media.photo instanceof File ? media.photo.name : 'photo.jpg'
    body.append('photo', media.photo, photoName)
  }
  if (media.videoFrame) body.append('videoFrame', media.videoFrame, 'video-frame.jpg')
  if (media.voice) {
    const voiceName = media.voice instanceof File ? media.voice.name : 'voice.webm'
    body.append('voice', media.voice, voiceName)
  }
  if (media.spokenText) body.append('spokenText', media.spokenText)
  if (media.lyrics) body.append('lyrics', media.lyrics)
  body.append('artistName', concertInfo.artist ?? '')
  body.append('concertName', concertInfo.concertName ?? '')
  body.append('venue', concertInfo.venue ?? '')
  body.append('city', concertInfo.city ?? '')
  body.append('ticketOCR', concertInfo.ticketOCR ?? '')
  body.append('songTitle', anchor?.title ?? '')
  body.append('songArtist', anchor?.artist ?? '')
}

export function useMemoryPipeline() {
  const [state, setState] = useState<MemoryPipelineState>(INITIAL_STATE)
  const runRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const pendingRef = useRef<PendingContinuation | null>(null)

  const finishWithAnchor = useCallback(async (anchor: SongAnchor, pending: PendingContinuation) => {
    const controller = controllerRef.current
    const runId = runRef.current
    const active = () => runRef.current === runId && !controller?.signal.aborted
    const update = (recipe: (current: MemoryPipelineState) => MemoryPipelineState) => {
      if (active()) setState(recipe)
    }
    const setError = (name: RequestName, error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      update((current) => ({
        ...current,
        errors: { ...current.errors, [name]: readableError(error) },
      }))
    }

    // 识曲完成即可离开加载页；豆包与电台在听歌页后台继续。
    update((current) => ({
      ...current,
      anchor,
      needsManualSong: false,
      identifyMessage: null,
      readiness: 'song-ready',
    }))
    pendingRef.current = null

    void (async () => {
      const multimodalBody = new FormData()
      appendMultimodalForm(multimodalBody, pending, anchor)
      // Do not bind the pipeline AbortSignal here: page transitions / Strict Mode
      // cleanup must not cancel Doubao while the user is already on the listen page.
      const multimodal = await fetch('/api/analyze-multimodal', {
        method: 'POST',
        body: multimodalBody,
      })
        .then((response) => readJson<MultimodalAnalysisResult>(response))
        .catch((error) => {
          setError('multimodal', error)
          return localMultimodal(pending.evidences, pending.localProfile)
        })
      if (!active()) return

      console.groupCollapsed(
        `%c[豆包·情绪认领] ${multimodal.status?.fallbackUsed ? '本地兜底' : '模型输出'}`,
        `color: ${multimodal.status?.fallbackUsed ? '#C46B6B' : '#C9A46A'}; font-weight: 600;`
      )
      console.log('lostItem:', multimodal.lostItem)
      console.log('claimReason:', multimodal.claimReason)
      console.log('emotionTags:', multimodal.emotionTags)
      console.log('status:', multimodal.status)
      console.log('full:', multimodal)
      console.groupEnd()

      update((current) => ({ ...current, multimodal }))

      const payload = {
        concertInfo: pending.concertInfo,
        multimodal,
        anchor,
        artistCatalog: pending.catalog,
      }
      const claimPromise = fetch('/api/claim-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concertInfo: payload.concertInfo,
          multimodal: payload.multimodal,
          anchor: payload.anchor,
        }),
      })
        .then((response) => readJson<ClaimFormFields>(response))
        .catch((error) => {
          setError('claim', error)
          return localClaim(pending.localProfile)
        })
      const radioPromise = fetch('/api/generate-radio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then((response) => readJson<RadioPlaylistResult>(response))
        .catch((error) => {
          setError('radio', error)
          return localRadio(pending.catalog, pending.localProfile)
        })

      const [claim, radio] = await Promise.all([claimPromise, radioPromise])
      if (!active()) return
      update((current) => ({ ...current, claim, radio, readiness: 'all-ready' }))
    })()
  }, [])

  const startPipeline = useCallback((input: StartPipelineInput) => {
    controllerRef.current?.abort()

    const runId = ++runRef.current
    const controller = new AbortController()
    controllerRef.current = controller
    pendingRef.current = null
    const active = () => runRef.current === runId && !controller.signal.aborted
    const update = (recipe: (current: MemoryPipelineState) => MemoryPipelineState) => {
      if (active()) setState(recipe)
    }
    const setError = (name: RequestName, error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      update((current) => ({
        ...current,
        errors: { ...current.errors, [name]: readableError(error) },
      }))
    }

    setState({ ...INITIAL_STATE, readiness: 'processing' })

    void (async () => {
      const catalogPromise = settleWithin(
        Promise.resolve(input.artistCatalog).catch(() => null),
        8_000,
        null
      )

      const identifyPromise = input.media.video
        ? (() => {
            const body = new FormData()
            body.append('video', input.media.video as File)
            body.append('durationSeconds', String(input.media.videoDuration ?? 0))
            body.append('artist', input.concertInfo.artist)
            return fetch('/api/identify-song', {
              method: 'POST',
              body,
              signal: controller.signal,
            })
              .then((response) => readJson<{
                anchor: SongAnchor | null
                candidates?: Array<{ title?: string; artist?: string; confidence?: number; recognitionType?: string }>
                source?: string
                message?: string
              }>(response))
              .then((result) => {
                const candidates = result.candidates ?? []
                const topConfidence = result.anchor?.confidence
                  ?? candidates[0]?.confidence
                console.groupCollapsed(
                  `%c[ACRCloud] ${result.anchor ? '识别并映射成功' : '未确认歌曲'}`,
                  `color: ${result.anchor ? '#C9A46A' : '#C46B6B'}; font-weight: 600;`
                )
                console.log('source:', result.source ?? 'unknown')
                console.log('confidence:', topConfidence ?? 'n/a')
                console.log('message:', result.message ?? '')
                console.table(candidates.map((item) => ({
                  title: item.title ?? '',
                  artist: item.artist ?? '',
                  confidence: item.confidence ?? 'n/a',
                  type: item.recognitionType ?? '',
                })))
                console.log('qqMusicAnchor:', result.anchor)
                console.groupEnd()
                return result
              })
              .catch((error) => {
                console.error('[ACRCloud] 请求失败:', error)
                setError('identify', error)
                return {
                  anchor: null as SongAnchor | null,
                  message: '音频识别暂时不可用，可能现场噪声较大或片段过短。',
                }
              })
          })()
        : Promise.resolve({
          anchor: null as SongAnchor | null,
          message: '未上传可用于识别的现场视频。',
        })

      const [identifyResult, catalog] = await Promise.all([
        identifyPromise,
        catalogPromise,
      ])
      if (!active()) return

      const pending: PendingContinuation = {
        concertInfo: input.concertInfo,
        catalog,
        localProfile: input.localProfile,
        evidences: input.evidences,
        media: input.media,
      }

      const identifiedAnchor = identifyResult.anchor
      if (identifiedAnchor) {
        await finishWithAnchor(identifiedAnchor, pending)
        return
      }

      pendingRef.current = pending
      update((current) => ({
        ...current,
        needsManualSong: true,
        identifyMessage: identifyResult.message
          || '可能音频太过嘈杂或片段太短，暂时难以辨认出歌曲。',
      }))
    })()
  }, [finishWithAnchor])

  const resolveManualSong = useCallback(async (input: { title: string; artist: string }) => {
    const pending = pendingRef.current
    if (!pending) throw new Error('当前没有等待确认的识别任务。')
    const controller = controllerRef.current
    const response = await fetch('/api/resolve-song', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller?.signal,
    })
    const result = await response.json().catch(() => ({})) as {
      anchor?: SongAnchor | null
      message?: string
      error?: string
    }
    if (!response.ok || !result.anchor) {
      throw new Error(result.error || result.message || '未找到匹配曲目，请调整歌名或歌手后重试。')
    }
    await finishWithAnchor(result.anchor, pending)
  }, [finishWithAnchor])

  const skipManualSong = useCallback(async () => {
    const pending = pendingRef.current
    if (!pending) return
    const anchor = trackToAnchor(pending.catalog, pending.localProfile)
    await finishWithAnchor(anchor, pending)
  }, [finishWithAnchor])

  useEffect(() => () => {
    controllerRef.current?.abort()
  }, [])

  return {
    ...state,
    startPipeline,
    resolveManualSong,
    skipManualSong,
  }
}
