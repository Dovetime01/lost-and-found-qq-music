'use client'

type SoundName = 'drawer' | 'page' | 'stamp' | 'typewriter' | 'vinyl'

let audioContext: AudioContext | null = null

const getAudioContext = () => {
  if (typeof window === 'undefined') return null

  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null

  audioContext ||= new AudioContextClass()
  return audioContext
}

const createNoiseBuffer = (context: AudioContext, duration: number) => {
  const length = Math.floor(context.sampleRate * duration)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)

  for (let index = 0; index < length; index += 1) {
    data[index] = Math.random() * 2 - 1
  }

  return buffer
}

const playNoise = (
  context: AudioContext,
  start: number,
  duration: number,
  gainValue: number,
  filterFrequency: number,
) => {
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const gain = context.createGain()

  source.buffer = createNoiseBuffer(context, duration)
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(filterFrequency, start)
  filter.Q.setValueAtTime(2, start)
  gain.gain.setValueAtTime(0.001, start)
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(context.destination)
  source.start(start)
  source.stop(start + duration)
}

const playTone = (
  context: AudioContext,
  start: number,
  duration: number,
  frequency: number,
  gainValue: number,
  type: OscillatorType = 'sine',
) => {
  const oscillator = context.createOscillator()
  const gain = context.createGain()

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(0.001, start)
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration)

  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(start)
  oscillator.stop(start + duration)
}

export const playSound = (name: SoundName) => {
  const context = getAudioContext()
  if (!context) return

  if (context.state === 'suspended') {
    void context.resume()
  }

  const now = context.currentTime

  if (name === 'typewriter') {
    playTone(context, now, 0.055, 720, 0.035, 'square')
    playTone(context, now + 0.06, 0.045, 560, 0.025, 'square')
    return
  }

  if (name === 'stamp') {
    playNoise(context, now, 0.12, 0.18, 180)
    playTone(context, now + 0.015, 0.1, 95, 0.12, 'triangle')
    return
  }

  if (name === 'vinyl') {
    playNoise(context, now, 0.32, 0.045, 2400)
    playTone(context, now + 0.04, 0.22, 118, 0.045, 'sine')
    return
  }

  if (name === 'drawer') {
    playNoise(context, now, 0.18, 0.08, 420)
    playTone(context, now + 0.1, 0.12, 150, 0.05, 'sawtooth')
    return
  }

  playNoise(context, now, 0.16, 0.055, 1200)
  playNoise(context, now + 0.08, 0.12, 0.035, 1800)
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
