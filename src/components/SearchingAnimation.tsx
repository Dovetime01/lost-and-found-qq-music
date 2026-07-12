'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState, type FormEvent } from 'react'
import type { PipelineReadiness } from '@/hooks/useMemoryPipeline'

interface SearchingAnimationProps {
  onNext: () => void
  readiness: PipelineReadiness
  needsManualSong: boolean
  identifyMessage?: string | null
  defaultArtist?: string
  onResolveManualSong: (input: { title: string; artist: string }) => Promise<void>
  onSkipManualSong: () => Promise<void>
}

const SEARCH_TEXTS = [
  '正在调取演出档案…',
  '正在比对记忆残片…',
  '正在检索音乐库…',
  '正在辨认现场歌曲…',
]

export default function SearchingAnimation({
  onNext,
  readiness,
  needsManualSong,
  identifyMessage,
  defaultArtist = '',
  onResolveManualSong,
  onSkipManualSong,
}: SearchingAnimationProps) {
  const reduceMotion = useReducedMotion()
  const [progress, setProgress] = useState(0)
  const [currentText, setCurrentText] = useState(0)
  const [animationDone, setAnimationDone] = useState(false)
  const [found, setFound] = useState(false)
  const [activeDrawers, setActiveDrawers] = useState<number[]>([])
  const [dust, setDust] = useState<Array<{ id: number; left: number; delay: number; duration: number; size: number; drift: number }>>([])
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState(defaultArtist.includes('待确认') ? '' : defaultArtist)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    setDust(
      Array.from({ length: 22 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 3,
        duration: 4 + Math.random() * 2,
        size: 1 + Math.random() * 2,
        drift: Math.random() * 20 - 10,
      })),
    )
  }, [])

  useEffect(() => {
    if (defaultArtist && !defaultArtist.includes('待确认')) {
      setArtist((current) => current || defaultArtist)
    }
  }, [defaultArtist])

  useEffect(() => {
    if (reduceMotion) {
      setAnimationDone(true)
      return
    }

    const progressInterval = window.setInterval(() => {
      setProgress((prev) => (prev >= 100 ? 100 : prev + 1.5))
    }, 100)

    const textInterval = window.setInterval(() => {
      setCurrentText((prev) => (prev + 1) % SEARCH_TEXTS.length)
    }, 1600)

    const drawerInterval = window.setInterval(() => {
      const randomDrawer = Math.floor(Math.random() * 12)
      setActiveDrawers((prev) => [...prev.slice(-5), randomDrawer])
    }, 320)

    const doneTimeout = window.setTimeout(() => {
      setAnimationDone(true)
    }, 6600)

    return () => {
      window.clearInterval(progressInterval)
      window.clearInterval(textInterval)
      window.clearInterval(drawerInterval)
      window.clearTimeout(doneTimeout)
    }
  }, [reduceMotion])

  useEffect(() => {
    const songReady = readiness === 'song-ready' || readiness === 'all-ready'
    if (!animationDone || needsManualSong || !songReady) return
    setFound(true)
    const leave = window.setTimeout(onNext, reduceMotion ? 200 : 700)
    return () => window.clearTimeout(leave)
  }, [animationDone, needsManualSong, readiness, onNext, reduceMotion])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const nextTitle = title.trim()
    const nextArtist = artist.trim()
    if (!nextTitle) {
      setFormError('请先填写歌曲名。')
      return
    }
    setSubmitting(true)
    setFormError('')
    try {
      await onResolveManualSong({ title: nextTitle, artist: nextArtist })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '查找失败，请稍后重试。')
      setSubmitting(false)
    }
  }

  const handleSkip = async () => {
    setSubmitting(true)
    setFormError('')
    try {
      await onSkipManualSong()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '继续失败，请稍后重试。')
      setSubmitting(false)
    }
  }

  const songReady = readiness === 'song-ready' || readiness === 'all-ready'
  const waitingCopy = needsManualSong
    ? '识别未命中'
    : songReady
      ? '档案已找到'
      : animationDone
        ? '仍在确认现场歌曲…'
        : SEARCH_TEXTS[currentText]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex h-full min-h-full flex-col items-center justify-center overflow-hidden bg-[#0D0D0D]"
    >
      <motion.div
        animate={{ opacity: [0.15, 0.2, 0.15, 0.22, 0.15] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="pointer-events-none absolute right-0 top-0 h-1/2 w-full"
        style={{
          background: 'radial-gradient(ellipse at 100% 0%, rgba(201, 164, 106, 0.18) 0%, transparent 60%)',
        }}
      />

      {dust.map((p) => (
        <motion.div
          key={p.id}
          className="pointer-events-none absolute rounded-full"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: 'radial-gradient(circle, rgba(233, 223, 200, 0.4) 0%, transparent 70%)',
          }}
          animate={{ y: ['-5vh', '105vh'], x: [0, p.drift, 0], opacity: [0, 0.6, 0.6, 0] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'linear' }}
        />
      ))}

      <div className="absolute inset-0 px-4 py-6">
        <div className="grid h-full grid-cols-3 grid-rows-4 gap-2">
          {Array.from({ length: 12 }).map((_, i) => {
            const isActive = activeDrawers.includes(i)
            return (
              <motion.div
                key={i}
                className="relative"
                initial={{ opacity: 0.55 }}
                animate={{ opacity: isActive ? 1 : 0.55 }}
              >
                <div
                  className="relative h-full rounded"
                  style={{
                    background: 'linear-gradient(135deg, #3B2A22 0%, #2A1F1A 50%, #3B2A22 100%)',
                    boxShadow:
                      'inset 0 2px 4px rgba(255,255,255,0.05), inset 0 -2px 4px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.3)',
                  }}
                >
                  <motion.div
                    animate={{ y: isActive ? [0, -18, 0] : 0 }}
                    transition={{ duration: 0.6, repeat: isActive ? 1 : 0, ease: 'easeInOut' }}
                    className="absolute inset-2 overflow-hidden rounded bg-archive-wood/80"
                    style={{ boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.1)' }}
                  >
                    <div className="absolute left-2 right-2 top-2 flex h-5 items-center justify-center rounded bg-archive-paper/25">
                      <span className="font-serif text-[11px] text-archive-paper/60">
                        #{String(i + 1).padStart(3, '0')}
                      </span>
                    </div>
                    <div
                      className="absolute bottom-2 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full"
                      style={{ background: 'linear-gradient(135deg, #C9A46A 0%, #8B7355 100%)' }}
                    />
                    {isActive && (
                      <motion.div
                        initial={{ y: 16, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="absolute bottom-6 left-1 right-1 top-9 flex flex-col gap-1"
                      >
                        {Array.from({ length: 3 }).map((_, j) => (
                          <div key={j} className="h-3 rounded bg-archive-paper/40" />
                        ))}
                      </motion.div>
                    )}
                  </motion.div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      <div className="relative z-10 flex w-full flex-col items-center px-5 text-center">
        {!needsManualSong && (
          <div
            className="mb-5 rounded-lg px-5 py-4"
            style={{
              background: 'rgba(13, 13, 13, 0.72)',
              backdropFilter: 'blur(2px)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.55)',
            }}
          >
            <motion.p
              key={waitingCopy}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 min-h-5 font-serif text-sm text-archive-paper"
            >
              {waitingCopy}
              {!songReady && (
                <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity }}>
                  |
                </motion.span>
              )}
            </motion.p>

            <div className="mx-auto mb-3 h-1 w-44 overflow-hidden rounded-full bg-archive-wood/40">
              <motion.div
                className="h-full rounded-full bg-archive-gold"
                animate={{ width: `${Math.min(progress, 100)}%` }}
                transition={{ duration: 0.1 }}
              />
            </div>

            <div className="font-serif text-3xl font-bold text-archive-gold">
              {found ? '' : `${Math.round(Math.min(progress, 100))}%`}
            </div>
          </div>
        )}

        {found && !needsManualSong && (
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: -12 }}
            transition={{ type: 'spring', stiffness: 200 }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <div
              className="border-4 border-red-600/80 px-6 py-3 font-serif text-2xl font-bold text-red-600/80"
              style={{ opacity: 0.9 }}
            >
              FOUND
            </div>
          </motion.div>
        )}

        {needsManualSong && (
          <motion.form
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleSubmit}
            className="w-full max-w-[300px] rounded-lg border border-archive-gold/25 px-4 py-5 text-left"
            style={{
              background: 'rgba(18, 14, 12, 0.92)',
              boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
            }}
          >
            <p className="text-[10px] tracking-[0.28em] text-archive-gold/70">MANUAL CONFIRM</p>
            <h2 className="mt-2 font-serif text-lg text-archive-paper">未能自动辨认歌曲</h2>
            <p className="mt-2 font-serif text-[12px] leading-relaxed text-archive-paper/65">
              {identifyMessage
                || '可能音频太过嘈杂或片段太短，暂时难以辨认出歌曲。请手动填写歌名与歌手，我们再去曲库查找。'}
            </p>

            <label className="mt-4 block">
              <span className="text-[10px] tracking-[0.18em] text-archive-gold/55">歌曲名</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：晴天"
                disabled={submitting}
                className="mt-1.5 w-full border border-archive-gold/20 bg-transparent px-3 py-2 font-serif text-sm text-archive-paper outline-none placeholder:text-archive-paper/25 focus:border-archive-gold/50"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-[10px] tracking-[0.18em] text-archive-gold/55">歌手</span>
              <input
                value={artist}
                onChange={(event) => setArtist(event.target.value)}
                placeholder="例如：周杰伦"
                disabled={submitting}
                className="mt-1.5 w-full border border-archive-gold/20 bg-transparent px-3 py-2 font-serif text-sm text-archive-paper outline-none placeholder:text-archive-paper/25 focus:border-archive-gold/50"
              />
            </label>

            {formError && (
              <p className="mt-3 font-serif text-[11px] leading-relaxed text-red-400/90">{formError}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-4 w-full border border-archive-gold/55 bg-archive-gold/15 py-2.5 font-serif text-sm text-archive-gold transition hover:bg-archive-gold/25 disabled:opacity-50"
            >
              {submitting ? '正在查找…' : '查找这首歌'}
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSkip()}
              className="mt-2 w-full py-2 font-serif text-[11px] text-archive-paper/45 transition hover:text-archive-paper/70 disabled:opacity-50"
            >
              暂时跳过，先用推荐曲目
            </button>
          </motion.form>
        )}
      </div>

      {!needsManualSong && (
        <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 gap-0.5">
          {Array.from({ length: 15 }).map((_, i) => (
            <motion.div
              key={i}
              className="w-0.5 rounded-full bg-archive-gold/40"
              animate={{ height: [8, 20 + Math.random() * 15, 8] }}
              transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.03 }}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}
