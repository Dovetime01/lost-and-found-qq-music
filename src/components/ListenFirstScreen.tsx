'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import StarrySeaBackground from '@/components/StarrySeaBackground'
import { stopBgmForever } from '@/lib/bgm'
import type { PipelineReadiness } from '@/hooks/useMemoryPipeline'
import type { SongAnchor } from '@/lib/pipelineTypes'

interface ListenFirstScreenProps {
  anchor: SongAnchor | null
  readiness: PipelineReadiness
  errorCount?: number
  onNext: () => void
}

export default function ListenFirstScreen({
  anchor,
  readiness,
  errorCount = 0,
  onNext,
}: ListenFirstScreenProps) {
  const reduceMotion = useReducedMotion()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [audioMessage, setAudioMessage] = useState('')
  const playableUrl = anchor?.playUrl || anchor?.tryUrl
  const isPreview = Boolean(anchor?.tryUrl && !anchor?.playUrl)
  const canContinue = readiness === 'all-ready'

  useEffect(() => {
    setPlaying(false)
    setAudioMessage('')
  }, [playableUrl])

  const togglePlayback = async () => {
    const audio = audioRef.current
    if (!audio || !playableUrl) {
      setAudioMessage('散场后的旋律正在整理')
      return
    }
    if (!audio.paused) {
      audio.pause()
      return
    }
    try {
      await audio.play()
      stopBgmForever()
    } catch {
      setAudioMessage('这段试听暂时无法播放，仍会继续整理档案。')
    }
  }

  const buttonText = readiness === 'all-ready'
    ? '档案已整理好，查看认领单'
    : readiness === 'song-ready'
      ? '正在生成失物认领单…'
      : '正在整理现场记忆…'

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex min-h-full flex-col items-center overflow-hidden bg-[#06080e] px-6 pb-8 pt-8 text-center text-archive-paper"
    >
      <StarrySeaBackground />
      {playableUrl && (
        <audio
          ref={audioRef}
          src={playableUrl}
          preload="metadata"
          onPlay={() => {
            setPlaying(true)
            stopBgmForever()
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => {
            setPlaying(false)
            setAudioMessage('这段试听暂时无法播放，仍会继续整理档案。')
          }}
        />
      )}

      <header className="relative z-10">
        <p className="text-[10px] tracking-[0.34em] text-archive-gold/65">LISTEN FIRST</p>
        <h1 className="mt-3 font-serif text-xl">先听一会儿，再认领</h1>
        <p className="mx-auto mt-3 max-w-xs text-xs leading-6 text-archive-paper/48">
          系统正在理解你留下的画面、声音和文字。<br />这不是倒计时，整理完成前，你可以先停在这里。
        </p>
      </header>

      <div className="relative z-10 mt-10 h-52 w-52">
        <motion.div
          animate={reduceMotion || !playing ? undefined : { rotate: 360 }}
          transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full bg-[repeating-radial-gradient(circle,#101010_0,#101010_4px,#1c1c1c_5px,#0b0b0b_7px)] shadow-[0_30px_80px_rgba(0,0,0,0.75)]"
        >
          <div className="absolute inset-[31%] rounded-full bg-[#B39059] shadow-inner">
            <div className="absolute inset-[42%] rounded-full bg-[#080807]" />
          </div>
          <div className="absolute inset-0 rounded-full bg-[linear-gradient(125deg,transparent_25%,rgba(255,255,255,0.1)_48%,transparent_62%)]" />
        </motion.div>
        <motion.div
          animate={{ rotate: playing ? -18 : -34 }}
          className="absolute -right-7 top-0 h-40 w-20 origin-[75%_10%]"
        >
          <div className="absolute right-3 top-0 h-9 w-9 rounded-full border border-archive-gold/35 bg-[#36271D]" />
          <div className="absolute right-7 top-7 h-28 w-1.5 rounded bg-gradient-to-b from-archive-gold to-[#67513A]" />
        </motion.div>
      </div>

      <section className="relative z-10 mt-7 min-h-20">
        {anchor ? (
          <>
            <p className="font-serif text-lg">{anchor.title}</p>
            <p className="mt-1 text-xs tracking-[0.14em] text-archive-gold/70">{anchor.artist}</p>
          </>
        ) : (
          <p className="text-sm text-archive-paper/55">散场后的旋律正在整理</p>
        )}
        <button
          type="button"
          onClick={togglePlayback}
          className="mt-4 h-12 w-12 rounded-full border border-archive-gold/40 bg-archive-gold text-lg text-[#0D0D0D] shadow-[0_0_25px_rgba(201,164,106,0.25)]"
          aria-label={playing ? '暂停试听' : '播放试听'}
        >
          {playing ? 'Ⅱ' : '▶'}
        </button>
        {isPreview && (
          <p className="mt-2 text-[11px] text-archive-gold/65">
            当前账号暂无该歌曲 VIP 完整播放权益，现可试听 1 分钟
          </p>
        )}
        {!playableUrl && (
          <p className="mt-2 text-[11px] text-archive-paper/38">
            当前歌曲未返回任何可播放或试听音频
          </p>
        )}
        {audioMessage && <p role="status" className="mt-2 text-[11px] text-archive-paper/55">{audioMessage}</p>}
      </section>

      <div className="relative z-10 mt-auto w-full pt-8">
        <p aria-live="polite" className="mb-3 text-[11px] text-archive-paper/45">
          {readiness === 'all-ready'
            ? `电台已就绪${errorCount ? '（部分内容使用本地整理）' : ''}`
            : readiness === 'song-ready'
              ? '歌曲已确认，正在等待情绪认领结果…'
              : anchor
                ? '已找到旋律锚点，正在生成认领单与电台'
                : '正在辨认线索并等待艺人曲库'}
        </p>
        <button
          type="button"
          disabled={!canContinue}
          onClick={onNext}
          className="w-full rounded border border-archive-gold/45 bg-archive-gold py-3 font-serif text-sm tracking-[0.12em] text-[#0D0D0D] disabled:cursor-wait disabled:bg-transparent disabled:text-archive-paper/38"
        >
          {buttonText}
        </button>
      </div>
    </motion.main>
  )
}
