'use client'

/** Session-scoped BGM. Stops forever after a song plays; only a full page reload restarts it. */

const BGM_SRC = '/bgm/bgm.mp3'
const BGM_VOLUME = 0.35

let audio: HTMLAudioElement | null = null
let permanentlyStopped = false
let unlockBound = false

function getAudio() {
  if (typeof window === 'undefined') return null
  if (!audio) {
    audio = new Audio(BGM_SRC)
    audio.loop = true
    audio.preload = 'auto'
    audio.volume = BGM_VOLUME
  }
  return audio
}

function tryPlay() {
  if (permanentlyStopped) return
  const el = getAudio()
  if (!el || !el.paused) return
  void el.play().catch(() => {
    // Autoplay may be blocked until a user gesture; unlock listener handles that.
  })
}

function bindUnlockOnce() {
  if (typeof window === 'undefined' || unlockBound || permanentlyStopped) return
  unlockBound = true
  const unlock = () => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    tryPlay()
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
}

/** Start looping BGM after login (Opening page). No-op if already stopped this session. */
export function startBgm() {
  if (permanentlyStopped) return
  bindUnlockOnce()
  tryPlay()
}

/** Stop BGM for the rest of this page lifetime (until refresh). */
export function stopBgmForever() {
  permanentlyStopped = true
  if (audio) {
    audio.pause()
    audio.currentTime = 0
  }
}
