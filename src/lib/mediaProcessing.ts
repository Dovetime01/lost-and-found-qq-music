import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'

const MAX_VIDEO_BYTES = 200 * 1024 * 1024
const MAX_VOICE_BYTES = 20 * 1024 * 1024
const MAX_WAV_BYTES = 2 * 1024 * 1024
/** Longer clips materially improve ACRCloud music hit-rate vs 8–10s fragments. */
const CLIP_SECONDS = 15
/** 44.1 kHz mono is appropriate for AVR music ID; humming still accepts this WAV. */
const RECOGNITION_SAMPLE_RATE = 44_100
const MAX_VOICE_SECONDS = 60
const PROCESS_TIMEOUT_MS = 20_000

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'])
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.webm', '.flac'])

export interface ProcessRunOptions {
  timeoutMs?: number
}

export type ProcessRunner = (
  executable: string,
  args: string[],
  options?: ProcessRunOptions
) => Promise<void>

function safeExtension(extension: string, allowed: Set<string>) {
  const normalized = (extension.startsWith('.') ? extension : `.${extension}`).toLowerCase()
  if (!allowed.has(normalized) || extname(`input${normalized}`) !== normalized) {
    throw new Error(`Unsupported media extension: ${extension || '(empty)'}`)
  }
  return normalized
}

export const runProcess: ProcessRunner = (executable, args, options = {}) => new Promise((resolve, reject) => {
  let child: ChildProcess
  try {
    child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  } catch (error) {
    reject(error)
    return
  }

  let stderr = ''
  let settled = false
  const timeout = setTimeout(() => {
    if (settled) return
    child.kill()
    settled = true
    reject(new Error('ffmpeg processing timed out'))
  }, options.timeoutMs ?? PROCESS_TIMEOUT_MS)

  child.stderr?.on('data', (chunk: Buffer) => {
    if (stderr.length < 8_000) stderr += chunk.toString()
  })
  child.once('error', (error) => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    reject(error)
  })
  child.once('close', (code) => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    if (code === 0) resolve()
    else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-1_000)}`))
  })
})

export function resolveFfmpegPath(
  configuredPath: string | null = ffmpegPath,
  cwd = process.cwd(),
  exists: (path: string) => boolean = existsSync
) {
  const bundledRelative = configuredPath?.match(/^[/\\]ROOT[/\\](.+)$/)?.[1]
  const executable = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const candidates = [
    process.env.FFMPEG_PATH,
    configuredPath,
    bundledRelative ? join(cwd, bundledRelative) : undefined,
    join(cwd, 'node_modules', 'ffmpeg-static', executable),
  ].filter((candidate): candidate is string => Boolean(candidate))
  const resolved = candidates.find((candidate) => exists(candidate))
  if (!resolved) throw new Error('ffmpeg-static binary is unavailable on this platform')
  return resolved
}

async function processInTemporaryDirectory(
  input: Buffer,
  extension: string,
  args: (inputPath: string, outputPath: string) => string[],
  runner: ProcessRunner
) {
  const directory = await mkdtemp(join(tmpdir(), 'lost-found-media-'))
  const inputPath = join(directory, `input${extension}`)
  const outputPath = join(directory, 'output.wav')
  try {
    await writeFile(inputPath, input)
    await runner(resolveFfmpegPath(), args(inputPath, outputPath), { timeoutMs: PROCESS_TIMEOUT_MS })
    const wav = await readFile(outputPath)
    if (wav.length < 44 || wav.length > MAX_WAV_BYTES) {
      throw new Error(`Processed WAV size is outside the allowed range: ${wav.length} bytes`)
    }
    return wav
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function extractVideoAudio(
  input: Buffer,
  extension: string,
  targetTimeSeconds: number,
  runner: ProcessRunner = runProcess
) {
  if (!input.length || input.length > MAX_VIDEO_BYTES) {
    throw new Error(`Video must be between 1 byte and ${MAX_VIDEO_BYTES} bytes`)
  }
  if (!Number.isFinite(targetTimeSeconds) || targetTimeSeconds < 0 || targetTimeSeconds > 6 * 60 * 60) {
    throw new Error('Video target time must be between 0 and 21600 seconds')
  }
  const normalizedExtension = safeExtension(extension, VIDEO_EXTENSIONS)
  const start = Math.max(0, targetTimeSeconds - CLIP_SECONDS / 2)

  return processInTemporaryDirectory(input, normalizedExtension, (inputPath, outputPath) => [
    '-hide_banner',
    '-loglevel', 'error',
    '-ss', start.toFixed(3),
    '-i', inputPath,
    '-t', String(CLIP_SECONDS),
    '-vn',
    '-ac', '1',
    '-ar', String(RECOGNITION_SAMPLE_RATE),
    '-sample_fmt', 's16',
    '-c:a', 'pcm_s16le',
    '-f', 'wav',
    '-y', outputPath,
  ], runner)
}

export function recognitionWindowTargets(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return []
  const clipHalf = CLIP_SECONDS / 2
  return [clipHalf, durationSeconds / 2, Math.max(clipHalf, durationSeconds - clipHalf)]
    .map((target) => Math.max(0, Math.min(durationSeconds - 0.01, target)))
    .filter((target, index, values) => index === 0 || Math.abs(target - values[index - 1]) >= CLIP_SECONDS)
}

export async function extractVideoRecognitionWindows(
  input: Buffer,
  extension: string,
  durationSeconds: number,
  runner: ProcessRunner = runProcess
) {
  const targets = recognitionWindowTargets(durationSeconds)
  if (!targets.length) throw new Error('Video duration must be greater than zero')
  const clips: Array<{ targetTimeSeconds: number; wav: Buffer }> = []
  for (const targetTimeSeconds of targets) {
    clips.push({
      targetTimeSeconds,
      wav: await extractVideoAudio(input, extension, targetTimeSeconds, runner),
    })
  }
  return clips
}

export async function normalizeVoiceAudio(
  input: Buffer,
  extension: string,
  runner: ProcessRunner = runProcess
) {
  if (!input.length || input.length > MAX_VOICE_BYTES) {
    throw new Error(`Voice audio must be between 1 byte and ${MAX_VOICE_BYTES} bytes`)
  }
  const normalizedExtension = safeExtension(extension, AUDIO_EXTENSIONS)

  return processInTemporaryDirectory(input, normalizedExtension, (inputPath, outputPath) => [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', inputPath,
    '-t', String(MAX_VOICE_SECONDS),
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-sample_fmt', 's16',
    '-c:a', 'pcm_s16le',
    '-af', 'loudnorm=I=-20:TP=-2:LRA=11',
    '-f', 'wav',
    '-y', outputPath,
  ], runner)
}

export const mediaProcessingLimits = {
  maxVideoBytes: MAX_VIDEO_BYTES,
  maxVoiceBytes: MAX_VOICE_BYTES,
  maxWavBytes: MAX_WAV_BYTES,
  clipSeconds: CLIP_SECONDS,
  maxVoiceSeconds: MAX_VOICE_SECONDS,
} as const
