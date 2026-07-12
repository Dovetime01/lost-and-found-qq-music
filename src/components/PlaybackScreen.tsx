'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import StarrySeaBackground from '@/components/StarrySeaBackground'
import { stopBgmForever } from '@/lib/bgm'
import type { MemoryProfile } from '@/lib/analysis'
import type { RadioPlaylistResult, RadioStep } from '@/lib/pipelineTypes'

interface PlaybackScreenProps {
  profile: MemoryProfile
  radio?: RadioPlaylistResult | null
  onNext: () => void
}

function fallbackSteps(profile: MemoryProfile): RadioStep[] {
  const stages: RadioStep['stage'][] = ['liveWarmth', 'emotionResonance', 'crowdLoop', 'longUnheard', 'backToReality']
  return profile.playlist.slice(0, 5).map((song, index) => ({
    id: String(song.id),
    stage: stages[index],
    chapter: song.chapter,
    title: song.title,
    artist: song.artist,
    duration: song.duration,
    reason: song.reason,
    playUrl: song.playUrl,
    tryUrl: song.tryUrl,
    qqMusicUrl: song.qqMusicUrl,
    coverUrl: song.coverUrl,
    source: song.source,
  }))
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

export default function PlaybackScreen({ profile, radio, onNext }: PlaybackScreenProps) {
  const reduceMotion = useReducedMotion()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playlist = (radio?.steps?.length ? radio.steps : fallbackSteps(profile)).slice(0, 5)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [audioError, setAudioError] = useState('')
  const song = playlist[index]
  const playUrl = song?.playUrl || song?.tryUrl
  const isPreview = Boolean(song?.tryUrl && !song?.playUrl)

  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setAudioError('')
  }, [index, playUrl])

  const changeSong = (delta: number) => {
    if (!playlist.length) return
    setIndex((current) => (current + delta + playlist.length) % playlist.length)
  }

  const toggle = async () => {
    const audio = audioRef.current
    if (!audio || !playUrl) {
      setAudioError('这首歌暂无可播放链接，可前往曲库查看。')
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
      setAudioError('浏览器未允许播放，请再次点击。')
    }
  }

  if (!song) {
    return (
      <main className="relative flex min-h-full flex-col items-center justify-center overflow-hidden bg-[#06080e] px-6 text-center text-archive-paper">
        <StarrySeaBackground />
        <p className="relative z-10">电台曲目暂未返回。</p>
        <button type="button" onClick={onNext} className="relative z-10 mt-5 rounded border border-archive-gold/45 px-5 py-2 text-archive-gold">
          收进失物柜
        </button>
      </main>
    )
  }

  return (
    <main className="relative min-h-full overflow-hidden bg-[#06080e] px-6 pb-6 pt-5 text-archive-paper">
      <StarrySeaBackground />
      {playUrl && (
        <audio
          ref={audioRef}
          src={playUrl}
          preload="metadata"
          onPlay={() => {
            setPlaying(true)
            stopBgmForever()
          }}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onEnded={() => {
            setPlaying(false)
            if (index < playlist.length - 1) setIndex((value) => value + 1)
          }}
          onError={() => {
            setPlaying(false)
            setAudioError('试听链接加载失败，可继续查看推荐。')
          }}
        />
      )}

      <header className="relative z-10 text-center">
        <p className="text-[10px] tracking-[0.3em] text-[#7ECFD3]/70">RETURN RADIO · {index + 1}/{playlist.length}</p>
        <h1 className="mt-2 font-serif text-lg">{song.chapter}</h1>
      </header>

      <div className="relative z-10 mx-auto mt-7 h-52 w-52">
        <motion.div
          animate={reduceMotion || !playing ? undefined : { rotate: 360 }}
          transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full bg-[repeating-radial-gradient(circle,#090909_0,#090909_4px,#202020_5px,#080808_7px)] shadow-[0_30px_70px_rgba(0,0,0,0.55)]"
        >
          <div className="absolute inset-[31%] flex items-center justify-center rounded-full bg-[#7ECFD3] text-[10px] tracking-widest text-[#0D1B2A]">
            FOUND
          </div>
        </motion.div>
      </div>

      <section className="relative z-10 mt-6 text-center">
        <h2 className="line-clamp-2 font-serif text-2xl">{song.title}</h2>
        <p className="mt-1 text-sm tracking-[0.13em] text-archive-gold/75">{song.artist}</p>
        <p className="mx-auto mt-3 line-clamp-2 max-w-xs text-xs leading-relaxed text-archive-paper/48">{song.reason}</p>
      </section>

      <div className="relative z-10 mt-5">
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => {
            if (!audioRef.current) return
            audioRef.current.currentTime = Number(event.target.value)
          }}
          disabled={!playUrl || !duration}
          aria-label="播放进度"
          className="w-full accent-[#7ECFD3]"
        />
        <div className="flex justify-between text-[11px] text-archive-paper/42">
          <span>{formatTime(currentTime)}</span>
          <span>{duration ? formatTime(duration) : song.duration ?? '0:00'}</span>
        </div>
      </div>

      <div className="relative z-10 mt-5 flex items-center justify-center gap-8">
        <button type="button" onClick={() => changeSong(-1)} disabled={playlist.length < 2} aria-label="上一首" className="text-xl disabled:opacity-25">‹‹</button>
        <button type="button" onClick={toggle} aria-label={playing ? '暂停' : '播放'} className="h-14 w-14 rounded-full bg-[#7ECFD3] text-xl text-[#0D1B2A] shadow-[0_0_30px_rgba(126,207,211,0.45)]">
          {playing ? 'Ⅱ' : '▶'}
        </button>
        <button type="button" onClick={() => changeSong(1)} disabled={playlist.length < 2} aria-label="下一首" className="text-xl disabled:opacity-25">››</button>
      </div>

      {isPreview && (
        <p className="relative z-10 mt-3 text-center text-[11px] text-archive-gold/70">
          当前账号暂无该歌曲 VIP 完整播放权益，现可试听 1 分钟
        </p>
      )}
      {!playUrl && (
        <p className="relative z-10 mt-3 text-center text-[11px] text-archive-paper/42">
          当前歌曲未返回任何可播放或试听音频，仅展示推荐结果。
        </p>
      )}
      {audioError && <p role="alert" className="relative z-10 mt-2 text-center text-[11px] text-red-200/65">{audioError}</p>}
      {song.qqMusicUrl && (
        <a
          href={song.qqMusicUrl}
          target="_blank"
          rel="noreferrer"
          className="relative z-10 mx-auto mt-3 block w-fit rounded border border-[#7ECFD3]/30 px-3 py-1.5 text-[11px] text-[#7ECFD3]"
        >
          打开音乐曲库
        </a>
      )}

      <button
        type="button"
        onClick={onNext}
        className="relative z-10 mt-5 w-full rounded border border-archive-gold/45 bg-black/20 py-3 text-sm tracking-[0.16em] text-archive-gold"
      >
        收进我的失物柜
      </button>
    </main>
  )
}
