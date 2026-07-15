'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { stopBgmForever } from '@/lib/bgm'

/** On https pages, upgrade QQ http stream URLs to avoid mixed-content blocks. */
function resolveMediaUrl(url: string) {
  try {
    const parsed = new URL(url)
    const isQq = parsed.hostname.includes('qqmusic.qq.com') || parsed.hostname.includes('stream.qqmusic')
    if (
      isQq
      && typeof window !== 'undefined'
      && window.location.protocol === 'https:'
      && parsed.protocol === 'http:'
    ) {
      parsed.protocol = 'https:'
      return parsed.toString()
    }
  } catch {
    // keep original
  }
  return url
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

interface UseStableAudioOptions {
  onEnded?: () => void
}

/**
 * Persistent HTMLAudioElement outside React render tree so pipeline re-renders
 * cannot remount the node mid-play().
 */
export function useStableAudio(
  src: string | null | undefined,
  options: UseStableAudioOptions = {}
) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const wantPlayRef = useRef(false)
  const loadedSrcRef = useRef('')
  const onEndedRef = useRef(options.onEnded)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    onEndedRef.current = options.onEnded
  }, [options.onEnded])

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audioRef.current = audio

    const onPlay = () => {
      setPlaying(true)
      stopBgmForever()
    }
    const onPause = () => setPlaying(false)
    const onEnded = () => {
      setPlaying(false)
      wantPlayRef.current = false
      onEndedRef.current?.()
    }
    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0)
    const onLoadedMetadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const onError = () => {
      if (audio.error?.code === 1) return
      setFailed(true)
      setPlaying(false)
      wantPlayRef.current = false
    }

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('error', onError)

    return () => {
      wantPlayRef.current = false
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('error', onError)
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const next = src?.trim() ? resolveMediaUrl(src.trim()) : ''
    if (loadedSrcRef.current === next) return

    loadedSrcRef.current = next
    setFailed(false)
    setCurrentTime(0)
    setDuration(0)

    const resume = wantPlayRef.current
    audio.pause()
    if (!next) {
      audio.removeAttribute('src')
      audio.load()
      wantPlayRef.current = false
      setPlaying(false)
      return
    }

    audio.src = next
    audio.load()
    console.info('[播放] stable audio src set', {
      urlPreview: next.slice(0, 96),
      resume,
    })
    if (resume) {
      void audio.play().then(() => stopBgmForever()).catch((error) => {
        if (isAbortError(error)) {
          window.setTimeout(() => {
            void audio.play().then(() => stopBgmForever()).catch(() => undefined)
          }, 60)
          return
        }
      })
    }
  }, [src])

  const playWithRetry = useCallback(async () => {
    const audio = audioRef.current
    if (!audio || !loadedSrcRef.current || failed) return false
    wantPlayRef.current = true

    const tryPlay = async () => {
      await audio.play()
      stopBgmForever()
      return true
    }

    try {
      return await tryPlay()
    } catch (error) {
      if (isAbortError(error)) {
        await new Promise((resolve) => window.setTimeout(resolve, 60))
        try {
          return await tryPlay()
        } catch {
          return false
        }
      }
      setFailed(true)
      wantPlayRef.current = false
      return false
    }
  }, [failed])

  const toggle = useCallback(async () => {
    const audio = audioRef.current
    if (!audio || !loadedSrcRef.current || failed) {
      return
    }
    if (!audio.paused) {
      wantPlayRef.current = false
      audio.pause()
      return
    }
    await playWithRetry()
  }, [failed, playWithRetry])

  const seek = useCallback((time: number) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(time)) return
    audio.currentTime = time
    setCurrentTime(time)
  }, [])

  return {
    playing,
    failed,
    currentTime,
    duration,
    canPlay: Boolean(src) && !failed,
    toggle,
    seek,
  }
}
