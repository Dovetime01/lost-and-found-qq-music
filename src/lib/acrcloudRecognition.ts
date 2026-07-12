import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MAX_SAMPLE_BYTES = 5 * 1024 * 1024

export type AcrCloudRecognitionType = 'music' | 'humming'

export interface AcrCloudConfig {
  host?: string
  accessKey?: string
  accessSecret?: string
  protocol?: 'http' | 'https'
  pythonPath?: string
  timeoutMs?: number
  /** Test override: return a full ACRCloud payload (music preferred over humming). */
  sdkRunner?: (wav: Buffer) => Promise<unknown>
}

export interface AcrCloudSongCandidate {
  title: string
  artist: string
  album?: string
  confidence?: number
  playOffsetMs?: number
  recognitionType: AcrCloudRecognitionType
}

export interface AcrCloudRecognitionResult {
  candidates: AcrCloudSongCandidate[]
  message?: string
  mode?: AcrCloudRecognitionType
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseCandidates(
  payload: unknown,
  recognitionType: AcrCloudRecognitionType
): AcrCloudSongCandidate[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const metadata = (payload as { metadata?: unknown }).metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return []
  const bucket = recognitionType === 'music'
    ? (metadata as { music?: unknown }).music
    : (metadata as { humming?: unknown }).humming
  if (!Array.isArray(bucket)) return []

  return bucket.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const song = item as {
      title?: unknown
      album?: { name?: unknown }
      artists?: Array<{ name?: unknown }>
      score?: unknown
      play_offset_ms?: unknown
    }
    const title = text(song.title)
    const artist = song.artists?.map((value) => text(value?.name)).filter(Boolean).join(' / ') ?? ''
    if (!title || !artist) return []
    return [{
      title,
      artist,
      album: text(song.album?.name) || undefined,
      confidence: number(song.score),
      playOffsetMs: number(song.play_offset_ms),
      recognitionType,
    }]
  })
}

function statusOf(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  return (payload as { status?: { code?: unknown; msg?: unknown } }).status
}

async function runPythonSdk(
  wav: Buffer,
  config: AcrCloudConfig,
  scriptPath: string,
  label: string
) {
  const directory = await mkdtemp(join(tmpdir(), `lost-found-acr-${label}-`))
  const wavPath = join(directory, 'sample.wav')
  await writeFile(wavPath, wav)

  try {
    return await new Promise<unknown>((resolve, reject) => {
      const child = spawn(config.pythonPath ?? process.env.ACRCLOUD_PYTHON_PATH ?? 'python', [
        scriptPath,
        wavPath,
      ], {
        windowsHide: true,
        env: {
          ...process.env,
          ACRCLOUD_HOST: text(config.host),
          ACRCLOUD_ACCESS_KEY: text(config.accessKey),
          ACRCLOUD_ACCESS_SECRET: text(config.accessSecret),
          ACRCLOUD_PROTOCOL: config.protocol ?? 'https',
          PYTHONIOENCODING: 'utf-8',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      let settled = false
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        child.kill()
        reject(new Error(`ACRCloud ${label} SDK timed out`))
      }, config.timeoutMs ?? 25_000)

      child.stdout.on('data', (chunk: Buffer) => {
        if (stdout.length < 1_000_000) stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 8_000) stderr += chunk.toString()
      })
      child.once('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        reject(new Error(`Unable to start ACRCloud ${label} SDK: ${error.message}`))
      })
      child.once('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        try {
          const payload = JSON.parse(stdout.trim()) as unknown
          if (code === 0) resolve(payload)
          else reject(new Error(
            text(statusOf(payload)?.msg)
              || stderr.trim()
              || `ACRCloud ${label} SDK exited with code ${String(code)}`
          ))
        } catch {
          reject(new Error(
            stderr.trim()
              || stdout.trim().slice(0, 300)
              || `ACRCloud ${label} SDK exited with code ${String(code)}`
          ))
        }
      })
    })
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
}

function interpretPayload(
  payload: unknown,
  preferred: AcrCloudRecognitionType
): AcrCloudRecognitionResult {
  const status = statusOf(payload)
  const code = number(status?.code)
  const message = text(status?.msg)

  if (code === 1001 || code === 2007) {
    return { candidates: [], message: message || 'No match', mode: preferred }
  }
  if (code !== 0) {
    throw new Error(`ACRCloud ${preferred} returned code ${String(code)}${message ? `: ${message}` : ''}`)
  }

  const primary = parseCandidates(payload, preferred)
  if (primary.length) {
    return { candidates: primary, message: message || undefined, mode: preferred }
  }

  const fallbackType: AcrCloudRecognitionType = preferred === 'music' ? 'humming' : 'music'
  const secondary = parseCandidates(payload, fallbackType)
  return {
    candidates: secondary,
    message: message || undefined,
    mode: secondary.length ? fallbackType : preferred,
  }
}

async function recognizeMode(
  wav: Buffer,
  config: AcrCloudConfig,
  mode: AcrCloudRecognitionType
): Promise<AcrCloudRecognitionResult> {
  const scriptPath = mode === 'music'
    ? (process.env.ACRCLOUD_MUSIC_SCRIPT_PATH ?? join('scripts', 'acrcloud_music.py'))
    : (process.env.ACRCLOUD_HUMMING_SCRIPT_PATH ?? join('scripts', 'acrcloud_humming.py'))
  const payload = await runPythonSdk(wav, config, scriptPath, mode)
  return interpretPayload(payload, mode)
}

/**
 * Prefer AVR music identification (works when the clip contains the original track).
 * Fall back to humming when music returns no result (user humming / singing along).
 */
export async function recognizeAcrCloudWav(
  wav: Buffer,
  config: AcrCloudConfig = {}
): Promise<AcrCloudRecognitionResult> {
  if (!text(config.accessKey) || !text(config.accessSecret) || !text(config.host)) {
    throw new Error('Missing ACRCLOUD_HOST / ACRCLOUD_ACCESS_KEY / ACRCLOUD_ACCESS_SECRET')
  }
  if (wav.length < 44 || wav.length > MAX_SAMPLE_BYTES) {
    throw new Error(`ACRCloud audio sample must be between 44 bytes and ${MAX_SAMPLE_BYTES} bytes`)
  }

  if (config.sdkRunner) {
    return interpretPayload(await config.sdkRunner(wav), 'music')
  }

  const music = await recognizeMode(wav, config, 'music')
  if (music.candidates.length) return music

  try {
    const humming = await recognizeMode(wav, config, 'humming')
    if (humming.candidates.length) return humming
    return {
      candidates: [],
      message: humming.message || music.message || 'No match',
      mode: 'humming',
    }
  } catch (error) {
    // Music already returned empty; surface humming failure only if music had no soft message.
    if (music.message) {
      return { candidates: [], message: music.message, mode: 'music' }
    }
    throw error
  }
}
