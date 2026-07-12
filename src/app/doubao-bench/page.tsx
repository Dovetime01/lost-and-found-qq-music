'use client'

import { useCallback, useMemo, useState } from 'react'
import { imageFileToStorageDataUrl } from '@/lib/imageCompression'
import { selectVideoFrameTime, VIDEO_FRAME_JPEG_QUALITY } from '@/lib/videoFrame'

type CaseId = 'photo' | 'video-frame' | 'text-only' | 'photo+video' | 'photo+text+video'

const SAMPLE_SPOKEN =
  '散场以后走在路上，耳机里还回荡着刚才那首合唱，心里有点舍不得，又觉得被轻轻接住了。'
const SAMPLE_LYRICS = '如果我们不曾相遇，我会是在哪里。'

interface BenchResult {
  caseId: CaseId
  ok: boolean
  prepMs: number
  requestMs: number
  totalMs: number
  payloadBytes: number
  photoBytes?: number
  videoFrameBytes?: number
  lostItem?: string
  claimReason?: string
  emotionTags?: string[]
  fallbackUsed?: boolean
  statusMessage?: string
  error?: string
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl)
  return response.blob()
}

async function captureVideoFrame(file: File): Promise<{ frame: Blob; duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    const cleanup = () => URL.revokeObjectURL(url)
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        cleanup()
        reject(new Error('无法读取视频时长'))
        return
      }
      video.currentTime = selectVideoFrameTime(video.duration)
    }
    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      const width = video.videoWidth || 960
      const height = video.videoHeight || 540
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')?.drawImage(video, 0, 0, width, height)
      canvas.toBlob((blob) => {
        if (!blob) {
          cleanup()
          reject(new Error('视频截帧失败'))
          return
        }
        const duration = video.duration
        cleanup()
        resolve({ frame: blob, duration, width, height })
      }, 'image/jpeg', VIDEO_FRAME_JPEG_QUALITY)
    }
    video.onerror = () => {
      cleanup()
      reject(new Error('浏览器无法读取此视频'))
    }
    video.src = url
  })
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatMs(ms: number) {
  return `${(ms / 1000).toFixed(2)}s (${Math.round(ms)}ms)`
}

export default function DoubaoBenchPage() {
  const [photo, setPhoto] = useState<File | null>(null)
  const [video, setVideo] = useState<File | null>(null)
  const [running, setRunning] = useState<CaseId | 'all' | null>(null)
  const [results, setResults] = useState<BenchResult[]>([])
  const [message, setMessage] = useState('选择文件后，点下方按钮开始测速。结果会同时打到 console。')

  const canPhoto = Boolean(photo)
  const canVideo = Boolean(video)

  const runCase = useCallback(async (caseId: CaseId) => {
    const startedAt = performance.now()
    const prepStarted = performance.now()
    const body = new FormData()

    // Stable concert / song context so text-only is not empty of context.
    body.append('artistName', '五月天')
    body.append('concertName', '好好好想见到你')
    body.append('venue', '国家体育场')
    body.append('city', '北京')
    body.append('songTitle', '干杯')
    body.append('songArtist', '五月天')
    body.append('ticketOCR', '五月天 好好好想见到你 国家体育场')

    let photoBytes = 0
    let videoFrameBytes = 0
    let frameMeta = ''

    if (caseId === 'text-only' || caseId === 'photo+text+video') {
      body.append('spokenText', SAMPLE_SPOKEN)
      body.append('lyrics', SAMPLE_LYRICS)
    }

    if (caseId === 'photo' || caseId === 'photo+video' || caseId === 'photo+text+video') {
      if (!photo) throw new Error('请先选择图片')
      const compressedDataUrl = await imageFileToStorageDataUrl(photo, { maxSize: 900, quality: 0.76 })
      const compressed = await dataUrlToBlob(compressedDataUrl)
      photoBytes = compressed.size
      body.append('photo', compressed, 'bench-photo.jpg')
    }

    if (caseId === 'video-frame' || caseId === 'photo+video' || caseId === 'photo+text+video') {
      if (!video) throw new Error('请先选择视频')
      const captured = await captureVideoFrame(video)
      videoFrameBytes = captured.frame.size
      frameMeta = `${captured.width}x${captured.height}, ${captured.duration.toFixed(1)}s`
      body.append('videoFrame', captured.frame, 'bench-video-frame.jpg')
    }

    const prepMs = performance.now() - prepStarted
    let payloadBytes = 0
    for (const value of body.values()) {
      payloadBytes += value instanceof Blob ? value.size : new TextEncoder().encode(String(value)).length
    }

    const requestStarted = performance.now()
    const response = await fetch('/api/analyze-multimodal', { method: 'POST', body })
    const requestMs = performance.now() - requestStarted
    const totalMs = performance.now() - startedAt

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(detail || `HTTP ${response.status}`)
    }

    const data = await response.json() as {
      lostItem?: string
      claimReason?: string
      emotionTags?: string[]
      status?: { fallbackUsed?: boolean; message?: string; source?: string; provider?: string }
    }

    const result: BenchResult = {
      caseId,
      ok: true,
      prepMs,
      requestMs,
      totalMs,
      payloadBytes,
      photoBytes: photoBytes || undefined,
      videoFrameBytes: videoFrameBytes || undefined,
      lostItem: data.lostItem,
      claimReason: data.claimReason,
      emotionTags: data.emotionTags,
      fallbackUsed: data.status?.fallbackUsed,
      statusMessage: data.status?.message,
    }

    console.groupCollapsed(
      `%c[豆包测速] ${caseId} → ${formatMs(totalMs)}${data.status?.fallbackUsed ? ' · 兜底' : ''}`,
      `color: ${data.status?.fallbackUsed ? '#C46B6B' : '#C9A46A'}; font-weight: 600;`
    )
    console.log('case:', caseId)
    console.log('prep:', formatMs(prepMs))
    console.log('request (含服务端→豆包):', formatMs(requestMs))
    console.log('total:', formatMs(totalMs))
    console.log('payload≈', formatBytes(payloadBytes))
    if (photoBytes) console.log('photo bytes:', formatBytes(photoBytes))
    if (videoFrameBytes) console.log('videoFrame bytes:', formatBytes(videoFrameBytes), frameMeta || '')
    console.log('lostItem:', data.lostItem)
    console.log('claimReason:', data.claimReason)
    console.log('emotionTags:', data.emotionTags)
    console.log('status:', data.status)
    if (data.status?.fallbackUsed) {
      console.warn('fallback reason:', data.status?.message || '(no message)')
    }
    console.log('full:', data)
    console.groupEnd()

    return result
  }, [photo, video])

  const runOne = useCallback(async (caseId: CaseId) => {
    setRunning(caseId)
    setMessage(`正在测试：${caseId} … 请打开 DevTools Console 查看详情。`)
    try {
      const result = await runCase(caseId)
      setResults((current) => [...current, result])
      setMessage(`${caseId} 完成：总耗时 ${formatMs(result.totalMs)}（请求 ${formatMs(result.requestMs)}）`)
    } catch (error) {
      const failed: BenchResult = {
        caseId,
        ok: false,
        prepMs: 0,
        requestMs: 0,
        totalMs: 0,
        payloadBytes: 0,
        error: error instanceof Error ? error.message : '未知错误',
      }
      console.error(`[豆包测速] ${caseId} 失败`, error)
      setResults((current) => [...current, failed])
      setMessage(`${caseId} 失败：${failed.error}`)
    } finally {
      setRunning(null)
    }
  }, [runCase])

  const runAll = useCallback(async () => {
    setRunning('all')
    setResults([])
    const order: CaseId[] = ['text-only', 'photo', 'video-frame', 'photo+video', 'photo+text+video']
    console.group('%c[豆包测速] 开始顺序对比', 'color:#C9A46A;font-weight:700')
    console.log('顺序:', order.join(' → '))
    console.groupEnd()

    const collected: BenchResult[] = []
    for (const caseId of order) {
      if ((caseId === 'photo' || caseId === 'photo+video' || caseId === 'photo+text+video') && !photo) {
        console.warn(`[豆包测速] 跳过 ${caseId}：未选择图片`)
        continue
      }
      if ((caseId === 'video-frame' || caseId === 'photo+video' || caseId === 'photo+text+video') && !video) {
        console.warn(`[豆包测速] 跳过 ${caseId}：未选择视频`)
        continue
      }
      setMessage(`顺序测试中：${caseId} …`)
      try {
        const result = await runCase(caseId)
        collected.push(result)
        setResults([...collected])
      } catch (error) {
        const failed: BenchResult = {
          caseId,
          ok: false,
          prepMs: 0,
          requestMs: 0,
          totalMs: 0,
          payloadBytes: 0,
          error: error instanceof Error ? error.message : '未知错误',
        }
        console.error(`[豆包测速] ${caseId} 失败`, error)
        collected.push(failed)
        setResults([...collected])
      }
    }

    console.group('%c[豆包测速] 汇总', 'color:#C9A46A;font-weight:700')
    console.table(collected.map((item) => ({
      case: item.caseId,
      ok: item.ok,
      total: item.ok ? formatMs(item.totalMs) : item.error,
      request: item.ok ? formatMs(item.requestMs) : '-',
      prep: item.ok ? formatMs(item.prepMs) : '-',
      payload: item.ok ? formatBytes(item.payloadBytes) : '-',
      photo: item.photoBytes ? formatBytes(item.photoBytes) : '-',
      videoFrame: item.videoFrameBytes ? formatBytes(item.videoFrameBytes) : '-',
      fallback: item.fallbackUsed ?? '-',
    })))
    console.groupEnd()
    setMessage('顺序对比完成，请看 Console 汇总表。')
    setRunning(null)
  }, [photo, runCase, video])

  const busy = running !== null
  const summary = useMemo(() => results.filter((item) => item.ok), [results])

  return (
    <main className="min-h-dvh bg-[#0D0D0D] px-5 py-8 text-[#E9DFC8]">
      <div className="mx-auto max-w-xl">
        <p className="text-[10px] tracking-[0.28em] text-[#C9A46A]/70">DOUBAO BENCH</p>
        <h1 className="mt-2 font-serif text-2xl text-[#C9A46A]">豆包情绪认领耗时测试</h1>
        <p className="mt-3 text-sm leading-6 text-[#E9DFC8]/65">
          分别测试：纯文字 / 仅图片 / 仅视频截帧 / 图片+视频 / 图片+文字+视频。
          打开浏览器 Console 可看详细耗时与返回内容。
        </p>

        <section className="mt-8 space-y-4 rounded border border-[#C9A46A]/25 bg-[#15110E] p-4">
          <label className="block text-sm">
            <span className="text-[#C9A46A]/80">图片</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              className="mt-2 block w-full text-xs file:mr-3 file:rounded file:border-0 file:bg-[#C9A46A] file:px-3 file:py-1.5 file:text-[#0D0D0D]"
              onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
            />
            {photo && (
              <span className="mt-1 block text-xs text-[#E9DFC8]/45">
                {photo.name} · {formatBytes(photo.size)}
              </span>
            )}
          </label>

          <label className="block text-sm">
            <span className="text-[#C9A46A]/80">视频（本地截取 50% 处一帧，与线上一致）</span>
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
              className="mt-2 block w-full text-xs file:mr-3 file:rounded file:border-0 file:bg-[#C9A46A] file:px-3 file:py-1.5 file:text-[#0D0D0D]"
              onChange={(event) => setVideo(event.target.files?.[0] ?? null)}
            />
            {video && (
              <span className="mt-1 block text-xs text-[#E9DFC8]/45">
                {video.name} · {formatBytes(video.size)}
              </span>
            )}
          </label>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void runOne('text-only')}
            className="rounded border border-[#C9A46A]/35 px-3 py-3 text-sm disabled:opacity-40"
          >
            ① 纯文字
          </button>
          <button
            type="button"
            disabled={busy || !canPhoto}
            onClick={() => void runOne('photo')}
            className="rounded border border-[#C9A46A]/35 px-3 py-3 text-sm disabled:opacity-40"
          >
            ② 仅图片
          </button>
          <button
            type="button"
            disabled={busy || !canVideo}
            onClick={() => void runOne('video-frame')}
            className="rounded border border-[#C9A46A]/35 px-3 py-3 text-sm disabled:opacity-40"
          >
            ③ 仅视频截帧
          </button>
          <button
            type="button"
            disabled={busy || !canPhoto || !canVideo}
            onClick={() => void runOne('photo+video')}
            className="rounded border border-[#C9A46A]/35 px-3 py-3 text-sm disabled:opacity-40"
          >
            ④ 图片+视频
          </button>
          <button
            type="button"
            disabled={busy || !canPhoto || !canVideo}
            onClick={() => void runOne('photo+text+video')}
            className="col-span-2 rounded border border-[#C9A46A]/35 px-3 py-3 text-sm disabled:opacity-40"
          >
            ⑤ 图片 + 文字 + 视频
          </button>
        </section>

        <button
          type="button"
          disabled={busy}
          onClick={() => void runAll()}
          className="mt-3 w-full rounded bg-[#C9A46A] py-3 font-serif text-sm tracking-[0.14em] text-[#0D0D0D] disabled:opacity-40"
        >
          {running === 'all' ? '顺序测试中…' : '一键顺序对比（结果打 console.table）'}
        </button>

        <p className="mt-4 text-xs leading-5 text-[#E9DFC8]/55" aria-live="polite">
          {busy ? `进行中：${running}` : message}
        </p>

        {summary.length > 0 && (
          <section className="mt-6 overflow-x-auto rounded border border-[#C9A46A]/20">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-[#1A1510] text-[#C9A46A]/80">
                <tr>
                  <th className="px-3 py-2">Case</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Request</th>
                  <th className="px-3 py-2">Payload</th>
                  <th className="px-3 py-2">Fallback</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item, index) => (
                  <tr key={`${item.caseId}-${index}`} className="border-t border-[#C9A46A]/10">
                    <td className="px-3 py-2">{item.caseId}</td>
                    <td className="px-3 py-2">{item.ok ? formatMs(item.totalMs) : item.error}</td>
                    <td className="px-3 py-2">{item.ok ? formatMs(item.requestMs) : '-'}</td>
                    <td className="px-3 py-2">{item.ok ? formatBytes(item.payloadBytes) : '-'}</td>
                    <td className="px-3 py-2">{item.ok ? String(Boolean(item.fallbackUsed)) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <p className="mt-6 text-[11px] text-[#E9DFC8]/35">
          路径：<code className="text-[#C9A46A]/70">/doubao-bench</code>
          。调用的是正式接口 <code className="text-[#C9A46A]/70">/api/analyze-multimodal</code>。
        </p>
      </div>
    </main>
  )
}
