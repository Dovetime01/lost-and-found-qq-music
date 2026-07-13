import { createHmac } from 'node:crypto'

const MAX_SAMPLE_BYTES = 5 * 1024 * 1024
const IDENTIFY_PATH = '/v1/identify'

export type AcrCloudRecognitionType = 'music' | 'humming'

export interface AcrCloudConfig {
  host?: string
  accessKey?: string
  accessSecret?: string
  protocol?: 'http' | 'https'
  timeoutMs?: number
  /** Test override: return a full ACRCloud payload (music preferred over humming). */
  sdkRunner?: (wav: Buffer) => Promise<unknown>
  /** Test override for the Identify HTTP call. */
  fetchImpl?: typeof fetch
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

function normalizeHost(host: string) {
  return host.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
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

function buildSignature(
  accessKey: string,
  accessSecret: string,
  dataType: string,
  timestamp: string
) {
  const stringToSign = ['POST', IDENTIFY_PATH, accessKey, dataType, '1', timestamp].join('\n')
  return createHmac('sha1', accessSecret)
    .update(Buffer.from(stringToSign, 'utf-8'))
    .digest('base64')
}

async function identifyAudioHttp(wav: Buffer, config: AcrCloudConfig): Promise<unknown> {
  const host = normalizeHost(text(config.host))
  const accessKey = text(config.accessKey)
  const accessSecret = text(config.accessSecret)
  const protocol = config.protocol ?? 'https'
  const dataType = 'audio'
  const timestamp = String(Date.now() / 1000)
  const signature = buildSignature(accessKey, accessSecret, dataType, timestamp)
  const fetchImpl = config.fetchImpl ?? fetch

  const form = new FormData()
  form.append('sample', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'sample.wav')
  form.append('sample_bytes', String(wav.length))
  form.append('access_key', accessKey)
  form.append('data_type', dataType)
  form.append('signature_version', '1')
  form.append('signature', signature)
  form.append('timestamp', timestamp)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 25_000)
  try {
    const response = await fetchImpl(`${protocol}://${host}${IDENTIFY_PATH}`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    const body = await response.text()
    let payload: unknown
    try {
      payload = JSON.parse(body) as unknown
    } catch {
      throw new Error(
        response.ok
          ? 'ACRCloud returned a non-JSON response'
          : `ACRCloud HTTP ${response.status}: ${body.slice(0, 180)}`
      )
    }
    if (!response.ok) {
      const message = text(statusOf(payload)?.msg) || body.slice(0, 180)
      throw new Error(`ACRCloud HTTP ${response.status}${message ? `: ${message}` : ''}`)
    }
    return payload
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('ACRCloud music SDK timed out')
    }
    throw error
  } finally {
    clearTimeout(timeout)
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

/**
 * Identify a WAV clip through ACRCloud's HTTP Identify API (data_type=audio).
 * Works on Vercel / serverless — no local Python SDK required.
 *
 * Prefer AVR music matches; if the same response includes humming metadata and
 * music is empty, surface those humming candidates.
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

  return interpretPayload(await identifyAudioHttp(wav, config), 'music')
}
