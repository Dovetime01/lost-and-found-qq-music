import { createHash } from 'node:crypto'
import { request as httpsRequest } from 'node:https'

export const XFYUN_SONG_URL = 'https://webqbh.xfyun.cn/v1/service/v1/qbh'
export const XFYUN_MAX_AUDIO_BYTES = 2 * 1024 * 1024

export interface XfyunSongCandidate {
  id?: string
  title: string
  artist: string
  album?: string
  confidence?: number
  raw?: unknown
}

export interface XfyunRecognitionResult {
  candidates: XfyunSongCandidate[]
  best: XfyunSongCandidate | null
  rawData: unknown
}

export interface XfyunConfig {
  appId?: string
  apiKey?: string
  fetcher?: typeof fetch
  now?: () => number
  timeoutMs?: number
}

export function createXfyunHeaders(appId: string, apiKey: string, now = Date.now()) {
  const curTime = Math.floor(now / 1000).toString()
  const xParam = Buffer.from(JSON.stringify({
    engine_type: 'afs',
    aue: 'raw',
    sample_rate: '16000',
  })).toString('base64')
  const checkSum = createHash('md5').update(`${apiKey}${curTime}${xParam}`).digest('hex')
  return {
    'X-Appid': appId,
    'X-CurTime': curTime,
    'X-Param': xParam,
    'X-CheckSum': checkSum,
    'Content-Type': 'application/octet-stream',
  }
}

function text(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function numeric(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

function isLegacySignatureError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const value = error as { code?: unknown; cause?: unknown }
  return value.code === 'ERR_SSL_WRONG_SIGNATURE_TYPE'
    || value.code === 'EPROTO' && String((error as { message?: unknown }).message).includes('wrong signature type')
    || isLegacySignatureError(value.cause)
}

function postWithLegacyTls(
  headers: Record<string, string>,
  wav: Buffer,
  signal: AbortSignal
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(XFYUN_SONG_URL, {
      method: 'POST',
      headers,
      signal,
      ciphers: 'DEFAULT@SECLEVEL=0',
    }, (response) => {
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > 2 * 1024 * 1024) {
          request.destroy(new Error('Xunfei response is too large'))
          return
        }
        chunks.push(chunk)
      })
      response.once('end', () => {
        const status = response.statusCode ?? 0
        if (status < 200 || status >= 300) {
          reject(new Error(`Xunfei recognition failed with status ${status}`))
          return
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown)
        } catch {
          reject(new Error('Xunfei recognition returned invalid JSON'))
        }
      })
    })
    request.once('error', reject)
    request.end(wav)
  })
}

function candidateFrom(raw: unknown): XfyunSongCandidate | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const title = text(
    value.song ?? value.song_name ?? value.songname ?? value.songName ?? value.title ?? value.name
  )
  const artist = text(
    value.singer ?? value.singer_name ?? value.singername ?? value.singname ?? value.artist ?? value.author
  )
  if (!title) return null
  return {
    id: text(value.song_id ?? value.songid ?? value.id) || undefined,
    title,
    artist,
    album: text(value.album_name ?? value.albumname ?? value.album) || undefined,
    confidence: numeric(value.confidence ?? value.score),
    raw,
  }
}

function candidateArrays(payload: unknown): unknown[][] {
  if (Array.isArray(payload)) return [payload]
  if (!payload || typeof payload !== 'object') return []
  const value = payload as Record<string, unknown>
  const direct = ['song_list', 'songlist', 'songs', 'list', 'result']
    .map((key) => value[key])
    .filter((item): item is unknown[] => Array.isArray(item))
  return [
    ...direct,
    ...['data', 'result'].flatMap((key) => candidateArrays(value[key])),
  ]
}

export function normalizeXfyunResponse(payload: unknown, preferredArtist = '') {
  const candidates = candidateArrays(payload)
    .flat()
    .map(candidateFrom)
    .filter((candidate): candidate is XfyunSongCandidate => Boolean(candidate))
  const unique = candidates.filter((candidate, index, list) =>
    list.findIndex((item) =>
      `${item.title}:${item.artist}`.toLowerCase() === `${candidate.title}:${candidate.artist}`.toLowerCase()
    ) === index
  )
  return prioritizeCandidatesByArtist(unique, preferredArtist)
}

function matchKey(value: string) {
  return value.toLocaleLowerCase().replace(/[\s·・._\-—/\\]+/g, '')
}

export function prioritizeCandidatesByArtist(
  candidates: XfyunSongCandidate[],
  preferredArtist: string
) {
  const preferred = matchKey(preferredArtist)
  if (!preferred) return [...candidates]
  return candidates
    .map((candidate, index) => {
      const artist = matchKey(candidate.artist)
      const artistScore = artist && (artist.includes(preferred) || preferred.includes(artist)) ? 1 : 0
      return { candidate, index, artistScore }
    })
    .sort((a, b) =>
      b.artistScore - a.artistScore
      || (b.candidate.confidence ?? 0) - (a.candidate.confidence ?? 0)
      || a.index - b.index
    )
    .map(({ candidate }) => candidate)
}

export async function recognizeSongFromWav(
  wav: Buffer,
  preferredArtist = '',
  config: XfyunConfig = {}
): Promise<XfyunRecognitionResult> {
  if (!config.appId || !config.apiKey) {
    throw new Error('Missing XFYUN_SONG_APP_ID or XFYUN_SONG_API_KEY')
  }
  if (!wav.length || wav.length > XFYUN_MAX_AUDIO_BYTES) {
    throw new Error(`Recognition WAV must be between 1 byte and ${XFYUN_MAX_AUDIO_BYTES} bytes`)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 8_000)
  try {
    const headers = createXfyunHeaders(config.appId, config.apiKey, (config.now ?? Date.now)())
    let payload: unknown
    try {
      const response = await (config.fetcher ?? fetch)(XFYUN_SONG_URL, {
        method: 'POST',
        headers,
        body: new Uint8Array(wav),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`Xunfei recognition failed with status ${response.status}`)
      payload = await response.json() as unknown
    } catch (error) {
      if (config.fetcher || !isLegacySignatureError(error)) throw error
      payload = await postWithLegacyTls(headers, wav, controller.signal)
    }
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const code = (payload as Record<string, unknown>).code
      if (code !== undefined && Number(code) !== 0) {
        const message = text((payload as Record<string, unknown>).desc)
          || text((payload as Record<string, unknown>).message)
        throw new Error(`Xunfei recognition returned code ${String(code)}${message ? `: ${message}` : ''}`)
      }
    }
    const candidates = normalizeXfyunResponse(payload, preferredArtist)
    return {
      candidates,
      best: candidates[0] ?? null,
      rawData: payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>).data ?? payload
        : payload,
    }
  } finally {
    clearTimeout(timeout)
  }
}
