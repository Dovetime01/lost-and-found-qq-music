'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import StarrySeaBackground from '@/components/StarrySeaBackground'
import type { EvidenceInput } from '@/lib/analysis'
import { createEvidenceArtifact } from '@/lib/evidenceArtifacts'
import { imageFileToStorageDataUrl } from '@/lib/imageCompression'
import type { EvidenceMediaBundle } from '@/lib/pipelineTypes'
import { selectVideoFrameTime, VIDEO_FRAME_JPEG_QUALITY } from '@/lib/videoFrame'

interface EvidenceCollectionProps {
  onNext: (inputs: EvidenceInput[], media: EvidenceMediaBundle) => void
}

type EvidenceKind = 'photo' | 'video' | 'voice' | 'spokenText' | 'lyrics'

interface EvidenceValue {
  kind: EvidenceKind
  label: string
  icon: string
  value: string
  file?: File | Blob
  previewUrl?: string
  frame?: Blob
  frameUrl?: string
  duration?: number
}

const ITEMS: Array<Pick<EvidenceValue, 'kind' | 'label' | 'icon'>> = [
  { kind: 'photo', label: '照片', icon: '📷' },
  { kind: 'video', label: '视频', icon: '🎬' },
  { kind: 'voice', label: '随便说说', icon: '🎙' },
  { kind: 'spokenText', label: '一句话', icon: '📝' },
  { kind: 'lyrics', label: '一句歌词', icon: '♪' },
]

// 便贴墙上每件线索的位置、倾斜角与占位提示
const BOARD_META: Record<EvidenceKind, { top: string; left: string; rotate: number; placeholder: string }> = {
  photo: { top: '7%', left: '8%', rotate: -5, placeholder: '现场的一张照片' },
  video: { top: '12%', left: '54%', rotate: 4, placeholder: '最难忘的合唱片段' },
  voice: { top: '40%', left: '30%', rotate: -2, placeholder: '大合唱的录音' },
  spokenText: { top: '45%', left: '58%', rotate: 4, placeholder: '我好像把自己留在那晚了' },
  lyrics: { top: '68%', left: '12%', rotate: -3, placeholder: '还记得的那句歌词' },
}

// 红线锚点（0-100 归一坐标，随线索板等比缩放）
const STRING_POINTS: Record<EvidenceKind, { x: number; y: number }> = {
  photo: { x: 24, y: 22 },
  video: { x: 68, y: 26 },
  voice: { x: 42, y: 52 },
  spokenText: { x: 72, y: 58 },
  lyrics: { x: 26, y: 80 },
}

const LIMITS = {
  photo: 12 * 1024 * 1024,
  video: 4.5 * 1024 * 1024,
  voice: 20 * 1024 * 1024,
}

const FILE_EXTENSIONS: Record<'photo' | 'video' | 'voice', Set<string>> = {
  photo: new Set(['jpg', 'jpeg', 'png', 'webp']),
  video: new Set(['mp4', 'mov', 'webm', 'm4v']),
  voice: new Set(['wav', 'mp3', 'm4a', 'aac', 'ogg', 'webm', 'flac']),
}

function fileExtension(file: File) {
  return file.name.split('.').pop()?.toLowerCase() ?? ''
}

function normalizePhotoFile(file: File) {
  if (file.type.startsWith('image/')) return file
  const mimeType = fileExtension(file) === 'png'
    ? 'image/png'
    : fileExtension(file) === 'webp'
      ? 'image/webp'
      : 'image/jpeg'
  return new File([file], file.name, { type: mimeType, lastModified: file.lastModified })
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl)
  if (!response.ok) throw new Error('照片压缩失败，请更换图片。')
  return response.blob()
}

function captureVideoFrame(file: File): Promise<{ frame: Blob; duration: number }> {
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
        reject(new Error('无法读取视频时长，请更换 MP4 或 MOV 文件。'))
        return
      }
      video.currentTime = selectVideoFrameTime(video.duration)
    }
    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 960
      canvas.height = video.videoHeight || 540
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (!blob) {
          cleanup()
          reject(new Error('视频画面提取失败，请更换文件。'))
          return
        }
        const duration = video.duration
        cleanup()
        resolve({ frame: blob, duration })
      }, 'image/jpeg', VIDEO_FRAME_JPEG_QUALITY)
    }
    video.onerror = () => {
      cleanup()
      reject(new Error('浏览器无法读取此视频格式。建议上传 MP4。'))
    }
    video.src = url
  })
}

export default function EvidenceCollection({ onNext }: EvidenceCollectionProps) {
  const reduceMotion = useReducedMotion()
  const [values, setValues] = useState<Partial<Record<EvidenceKind, EvidenceValue>>>({})
  const [editing, setEditing] = useState<EvidenceKind | null>(null)
  const [text, setText] = useState('')
  const [message, setMessage] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [recordedSeconds, setRecordedSeconds] = useState(0)
  const [isPreparing, setIsPreparing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<number | null>(null)
  const valuesRef = useRef(values)

  useEffect(() => {
    valuesRef.current = values
  }, [values])

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
    Object.values(valuesRef.current).forEach((item) => {
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
      if (item?.frameUrl) URL.revokeObjectURL(item.frameUrl)
    })
  }, [])

  const updateValue = (kind: EvidenceKind, value?: EvidenceValue) => {
    setValues((current) => ({ ...current, [kind]: value }))
  }

  const closeModal = () => {
    if (isRecording) stopRecording()
    setEditing(null)
    setText('')
    setMessage('')
  }

  const validateFile = (kind: EvidenceKind, file: File) => {
    const mediaKind = kind === 'voice' ? 'audio' : kind
    const supportedByMime = file.type.startsWith(`${mediaKind}/`)
    const supportedByExtension = kind in FILE_EXTENSIONS
      && FILE_EXTENSIONS[kind as keyof typeof FILE_EXTENSIONS].has(fileExtension(file))
    if (!supportedByMime && !supportedByExtension) {
      return `请选择${kind === 'voice' ? '音频' : kind === 'photo' ? '图片' : '视频'}文件。`
    }
    const limit = LIMITS[kind as keyof typeof LIMITS]
    if (limit && file.size > limit) {
      return kind === 'video'
        ? '视频不能超过 4.5MB，请压缩后重新上传。'
        : `文件过大：${kind === 'photo' ? '照片上限 12MB' : '声音上限 20MB'}。`
    }
    return ''
  }

  const handleFile = async (file?: File) => {
    if (!file || !editing || !['photo', 'video', 'voice'].includes(editing)) return
    const error = validateFile(editing, file)
    if (error) {
      setMessage(error)
      return
    }
    const preparedFile = editing === 'photo' ? normalizePhotoFile(file) : file
    setIsPreparing(true)
    setMessage('')
    try {
      if (editing === 'video') {
        const { frame, duration } = await captureVideoFrame(preparedFile)
        updateValue('video', {
          kind: 'video',
          label: '视频',
          icon: '🎬',
          value: preparedFile.name,
          file: preparedFile,
          previewUrl: URL.createObjectURL(preparedFile),
          frame,
          frameUrl: URL.createObjectURL(frame),
          duration,
        })
      } else if (editing === 'photo') {
        const compressedDataUrl = await imageFileToStorageDataUrl(preparedFile, {
          maxSize: 1280,
          quality: 0.76,
        })
        const compressed = await dataUrlToBlob(compressedDataUrl)
        updateValue('photo', {
          kind: 'photo',
          label: '照片',
          icon: '📷',
          value: preparedFile.name,
          file: compressed,
          previewUrl: URL.createObjectURL(compressed),
        })
      } else {
        updateValue('voice', {
          kind: 'voice',
          label: '随便说说',
          icon: '🎙',
          value: preparedFile.name,
          file: preparedFile,
          previewUrl: URL.createObjectURL(preparedFile),
        })
      }
      closeModal()
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '文件处理失败，请重试。')
    } finally {
      setIsPreparing(false)
    }
  }

  const finishRecording = (blob: Blob) => {
    updateValue('voice', {
      kind: 'voice',
      label: '随便说说',
      icon: '🎙',
      value: `浏览器录音 ${Math.max(recordedSeconds, 1)} 秒`,
      file: blob,
      previewUrl: URL.createObjectURL(blob),
    })
    setIsRecording(false)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
  }

  const startRecording = async () => {
    setMessage('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMessage('当前浏览器不支持录音，请改用声音文件上传。')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined)
      streamRef.current = stream
      recorderRef.current = recorder
      chunksRef.current = []
      setRecordedSeconds(0)
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => finishRecording(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
      recorder.start()
      setIsRecording(true)
      recordingTimerRef.current = window.setInterval(() => {
        setRecordedSeconds((seconds) => {
          if (seconds >= 44) {
            recorder.stop()
            return 45
          }
          return seconds + 1
        })
      }, 1000)
    } catch (error) {
      const denied = error instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(error.name)
      setMessage(denied ? '麦克风权限被拒绝。请在浏览器设置中允许后重试，或上传声音文件。' : '无法启动录音，请检查麦克风是否被其他应用占用。')
    }
  }

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  const submitText = () => {
    if (!editing || !text.trim()) return
    const item = ITEMS.find((candidate) => candidate.kind === editing)
    if (!item) return
    updateValue(editing, { ...item, value: text.trim() })
    closeModal()
  }

  const remove = (kind: EvidenceKind) => {
    const item = values[kind]
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
    if (item?.frameUrl) URL.revokeObjectURL(item.frameUrl)
    updateValue(kind)
  }

  const selected = ITEMS.map((item) => values[item.kind]).filter(Boolean) as EvidenceValue[]
  const selectedKinds = ITEMS.map((item) => item.kind).filter((kind) => Boolean(values[kind]))

  const handleSubmit = () => {
    const inputs: EvidenceInput[] = selected.map((item) => ({
      id: item.kind,
      type: item.kind === 'voice' ? 'audio' : item.kind === 'spokenText' ? 'note' : item.kind,
      label: item.label,
      content: item.value,
      artifact: createEvidenceArtifact({
        id: item.kind,
        type: item.kind === 'voice' ? 'audio' : item.kind === 'spokenText' ? 'note' : item.kind,
        label: item.label,
        content: item.value,
      }),
    }))
    const media: EvidenceMediaBundle = {
      photo: values.photo?.file,
      video: values.video?.file instanceof File ? values.video.file : undefined,
      videoFrame: values.video?.frame,
      voice: values.voice?.file,
      spokenText: values.spokenText?.value,
      lyrics: values.lyrics?.value,
      videoDuration: values.video?.duration,
    }
    onNext(inputs, media)
  }

  const editingValue = editing ? values[editing] : undefined
  const accept = editing === 'photo' ? 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'
    : editing === 'video' ? 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v'
      : 'audio/*,.wav,.mp3,.m4a,.aac,.ogg,.webm,.flac'

  const openEditor = (kind: EvidenceKind) => {
    setEditing(kind)
    setText(values[kind]?.value ?? '')
    setMessage('')
  }

  const boardLabel = (kind: EvidenceKind) =>
    kind === 'voice' ? '声音' : ITEMS.find((item) => item.kind === kind)?.label ?? ''

  const Pin = ({ filled }: { filled: boolean }) => (
    <>
      <div
        className="absolute -top-2 left-1/2 z-20 h-4 w-4 -translate-x-1/2 rounded-full"
        style={{
          background: filled
            ? 'radial-gradient(circle at 35% 30%, #E06070 0%, #8B0000 100%)'
            : 'radial-gradient(circle at 35% 30%, #DEBB84 0%, #8B7355 100%)',
          boxShadow: '0 2px 5px rgba(0,0,0,0.45)',
        }}
      />
      {filled && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -right-1.5 -top-1.5 z-20 flex h-5 w-5 items-center justify-center rounded-full"
          style={{ background: '#2E8B57', boxShadow: '0 2px 4px rgba(0,0,0,0.35)' }}
        >
          <span className="text-[10px] text-white">✓</span>
        </motion.div>
      )}
    </>
  )

  const renderArtifact = (kind: EvidenceKind) => {
    const value = values[kind]
    const filled = Boolean(value)
    const meta = BOARD_META[kind]
    const glow = filled
      ? '0 8px 22px rgba(201,164,106,0.4), 0 4px 12px rgba(0,0,0,0.4)'
      : '0 4px 12px rgba(0,0,0,0.4)'

    let artifact: ReactNode = null

    if (kind === 'photo') {
      artifact = (
        <div className="relative w-[104px] bg-archive-paper p-2" style={{ boxShadow: glow }}>
          <div className="mb-2 flex h-16 items-center justify-center overflow-hidden bg-archive-wood/15">
            {value?.previewUrl ? (
              <img src={value.previewUrl} alt="照片" className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg opacity-40">📷</span>
            )}
          </div>
          <p className="text-center font-serif text-[11px] text-archive-wood/70">{boardLabel(kind)}</p>
        </div>
      )
    } else if (kind === 'video') {
      artifact = (
        <div className="relative w-[94px] bg-archive-paper p-1" style={{ boxShadow: glow }}>
          <div className="mb-1 flex justify-between px-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-archive-wood/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-archive-wood/60" />
          </div>
          <div className="flex h-14 items-center justify-center overflow-hidden bg-archive-wood">
            {value?.frameUrl ? (
              <img src={value.frameUrl} alt="视频画面" className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm text-archive-paper/50">🎬</span>
            )}
          </div>
          <div className="mt-1 flex justify-between px-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-archive-wood/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-archive-wood/60" />
          </div>
          <p className="mt-1 text-center font-serif text-[11px] text-archive-wood/70">{boardLabel(kind)}</p>
        </div>
      )
    } else if (kind === 'voice') {
      artifact = (
        <div className="relative w-[104px] rounded bg-archive-wood/80 p-2" style={{ boxShadow: glow }}>
          <div className="mb-1 rounded bg-archive-wood p-1.5">
            <div className="flex justify-center gap-4">
              {[0, 1].map((r) => (
                <div
                  key={r}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-archive-paper/30 bg-archive-paper/20"
                >
                  <motion.div
                    className="h-3 w-3 rounded-full"
                    style={{ background: '#E9DFC8' }}
                    animate={filled && !reduceMotion ? { rotate: 360 } : {}}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex h-3 items-center justify-center rounded bg-archive-paper/30">
              <span className="text-[9px] text-archive-paper/60">A</span>
            </div>
          </div>
          <p className="text-center font-serif text-[11px] text-archive-paper/70">{boardLabel(kind)}</p>
        </div>
      )
    } else if (kind === 'spokenText') {
      artifact = (
        <div
          className="relative w-[100px] bg-yellow-100/90 p-2"
          style={{ boxShadow: glow }}
        >
          <div
            className="absolute bottom-0 right-0 h-3.5 w-3.5"
            style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(139,90,43,0.25) 50%)' }}
          />
          <p className="min-h-[42px] font-serif text-[11px] leading-relaxed text-archive-wood/75 line-clamp-3">
            {value?.value || meta.placeholder}
          </p>
          <p className="mt-1 text-center font-serif text-[10px] text-archive-wood/50">{boardLabel(kind)}</p>
        </div>
      )
    } else {
      artifact = (
        <div
          className="relative w-[104px] bg-archive-paper p-2"
          style={{
            boxShadow: glow,
            clipPath:
              'polygon(0% 6%, 12% 0%, 24% 4%, 38% 0%, 52% 5%, 66% 0%, 80% 4%, 92% 0%, 100% 5%, 100% 100%, 0% 100%)',
          }}
        >
          <p className="min-h-[42px] font-serif text-[11px] italic leading-relaxed text-archive-wood/75 line-clamp-3">
            {value?.value ? `“${value.value}”` : meta.placeholder}
          </p>
          <p className="mt-1 text-center font-serif text-[10px] text-archive-wood/50">{boardLabel(kind)}</p>
        </div>
      )
    }

    return (
      <motion.button
        key={kind}
        type="button"
        initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: filled ? 1.06 : 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 16 }}
        whileHover={{ scale: filled ? 1.1 : 1.05, zIndex: 30 }}
        onClick={() => openEditor(kind)}
        className="absolute cursor-pointer"
        style={{ top: meta.top, left: meta.left, zIndex: filled ? 10 : 1 }}
        aria-label={`${filled ? '编辑' : '添加'}${boardLabel(kind)}`}
      >
        <div className="relative" style={{ transform: `rotate(${meta.rotate}deg)` }}>
          <Pin filled={filled} />
          {artifact}
        </div>
      </motion.button>
    )
  }

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative min-h-full overflow-hidden bg-[#06080e] px-5 pb-8 pt-5 text-archive-paper"
    >
      <StarrySeaBackground />

      <header className="relative z-10 text-center">
        <h1 className="font-serif text-lg text-archive-paper">你遗失了什么？</h1>
        <p className="mt-2 text-[11px] leading-relaxed text-archive-paper/50">
          任何与那晚有关的东西
          <br />
          都可能成为线索
        </p>
      </header>

      {/* 线索板（便贴墙） */}
      <div
        className="relative z-10 mx-auto mt-5"
        style={{ width: '94%', maxWidth: '330px', height: '446px' }}
      >
        {/* 软木板底 */}
        <div
          className="absolute inset-0 overflow-hidden rounded-lg"
          style={{
            background: '#C4A77D',
            boxShadow: '0 20px 40px rgba(0,0,0,0.45), inset 0 0 20px rgba(0,0,0,0.12)',
          }}
        >
          <div
            className="absolute inset-0 opacity-50"
            style={{
              background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='cork'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.045' numOctaves='5' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0.55  0 0 0 0 0.42  0 0 0 0 0.24  0 0 0 1 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23cork)' opacity='0.55'/%3E%3C/svg%3E")`,
            }}
          />
          <div
            className="absolute inset-0 rounded-lg border-8"
            style={{ borderColor: '#3B2A22', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.25)' }}
          />
        </div>

        {/* 红线：连接已钉上的线索 */}
        {selectedKinds.length > 1 && (
          <svg
            className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {selectedKinds.slice(1).map((kind, index) => {
              const from = STRING_POINTS[selectedKinds[index]]
              const to = STRING_POINTS[kind]
              return (
                <motion.line
                  key={`${selectedKinds[index]}-${kind}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.55 }}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="#B31E37"
                  strokeWidth="0.5"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </svg>
        )}

        {/* 线索便签 */}
        {ITEMS.map((item) => renderArtifact(item.kind))}
      </div>

      <div className="relative z-10 mx-auto mt-5 max-w-sm">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!selected.length}
          className="w-full rounded-lg bg-archive-gold py-3.5 font-serif text-sm tracking-[0.18em] text-[#0D0D0D] shadow-[0_6px_20px_rgba(201,164,106,0.35)] transition-opacity disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none"
        >
          {selected.length ? `提交线索 · ${selected.length} 件` : '钉一件线索上墙'}
        </button>
        <p className="mt-2.5 text-center text-[11px] text-archive-paper/40">
          照片 ≤12MB · 视频 ≤4.5MB · 声音 ≤20MB · 录音最长 45 秒
        </p>
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-4 sm:items-center"
            onClick={closeModal}
          >
            <motion.section
              initial={reduceMotion ? false : { y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 40 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-sm rounded-t-xl bg-[#E9DFC8] p-5 text-[#3B2A22] shadow-2xl sm:rounded-xl"
              role="dialog"
              aria-modal="true"
              aria-label={`添加${ITEMS.find((item) => item.kind === editing)?.label}`}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-lg">{ITEMS.find((item) => item.kind === editing)?.label}</h2>
                <button type="button" onClick={closeModal} aria-label="关闭" className="h-9 w-9">✕</button>
              </div>

              {['spokenText', 'lyrics'].includes(editing) ? (
                <div className="mt-4">
                  <textarea
                    autoFocus
                    maxLength={240}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={editing === 'lyrics' ? '写下那句仍在耳边的歌词' : '随便写一句当时的感受'}
                    className="min-h-28 w-full resize-none rounded border border-[#3B2A22]/20 bg-white/45 p-3 text-sm outline-none focus:border-[#8B7355]"
                  />
                  <div className="mt-3 flex gap-2">
                    {editingValue && <button type="button" onClick={() => { remove(editing); closeModal() }} className="rounded border border-red-900/20 px-4 py-2 text-sm text-red-900/70">删除</button>}
                    <button type="button" onClick={submitText} disabled={!text.trim()} className="flex-1 rounded bg-[#C9A46A] py-2.5 text-sm disabled:opacity-40">保存</button>
                  </div>
                </div>
              ) : editing === 'voice' ? (
                <div className="mt-4 space-y-3">
                  {editingValue?.previewUrl && (
                    <audio controls src={editingValue.previewUrl} className="w-full" aria-label="试听录音" />
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={isRecording ? stopRecording : startRecording} className={`rounded py-3 text-sm ${isRecording ? 'bg-[#8B1E2D] text-white' : 'bg-[#C9A46A]'}`}>
                      {isRecording ? `停止录音 ${recordedSeconds}s` : editingValue ? '重新录音' : '开始录音'}
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded border border-[#3B2A22]/25 py-3 text-sm">上传声音文件</button>
                  </div>
                  {editingValue && <button type="button" onClick={() => remove('voice')} className="w-full py-2 text-sm text-red-900/70">删除这段声音</button>}
                  <p className="text-xs text-[#3B2A22]/55">声音只用于理解你想说的内容，不会与视频音轨合并。</p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {editing === 'photo' && editingValue?.previewUrl && <img src={editingValue.previewUrl} alt="照片预览" className="h-36 w-full rounded object-cover" />}
                  {editing === 'video' && editingValue?.frameUrl && <img src={editingValue.frameUrl} alt="视频50%位置画面" className="h-36 w-full rounded object-cover" />}
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isPreparing} className="w-full rounded border-2 border-dashed border-[#3B2A22]/25 py-10 text-sm disabled:opacity-50">
                    {isPreparing ? '正在读取文件…' : editingValue ? '更换文件' : '选择文件'}
                  </button>
                  {editingValue && <button type="button" onClick={() => { remove(editing); closeModal() }} className="w-full py-2 text-sm text-red-900/70">删除</button>}
                  <p className="text-xs text-[#3B2A22]/55">{editing === 'video' ? '视频需小于 4.5MB；将在浏览器本地截取50%处画面并记录时长。' : '支持 JPG、PNG、WebP。'}</p>
                </div>
              )}

              {message && <p role="alert" className="mt-3 rounded bg-red-900/10 p-2 text-xs text-red-900">{message}</p>}
              <input
                ref={fileInputRef}
                type="file"
                accept={accept}
                className="hidden"
                onChange={(event) => {
                  void handleFile(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.main>
  )
}
