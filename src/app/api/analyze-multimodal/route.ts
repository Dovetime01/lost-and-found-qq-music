import { extname } from 'node:path'
import { NextResponse } from 'next/server'
import { mediaProcessingLimits, normalizeVoiceAudio } from '@/lib/mediaProcessing'
import { analyzeMultimodal, type MultimodalInput } from '@/lib/multimodalAnalysis'

export const runtime = 'nodejs'

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

async function readImage(value: FormDataEntryValue | null) {
  if (!(value instanceof File)) return undefined
  if (!IMAGE_TYPES.has(value.type) || value.size <= 0 || value.size > MAX_IMAGE_BYTES) {
    throw new Error('Image must be JPEG, PNG, or WebP and no larger than 10MB')
  }
  return { data: Buffer.from(await value.arrayBuffer()), mimeType: value.type }
}

function formText(form: FormData, key: string, maxLength: number) {
  return String(form.get(key) ?? '').trim().slice(0, maxLength)
}

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const voice = form.get('voice')
    const input: MultimodalInput = {
      photo: await readImage(form.get('photo')),
      videoFrame: await readImage(form.get('videoFrame')),
      spokenText: formText(form, 'spokenText', 3_000),
      lyrics: formText(form, 'lyrics', 5_000),
      artistName: formText(form, 'artistName', 120),
      concertName: formText(form, 'concertName', 160),
      venue: formText(form, 'venue', 160),
      city: formText(form, 'city', 80),
      ticketOCR: formText(form, 'ticketOCR', 4_000),
      songTitle: formText(form, 'songTitle', 120),
      songArtist: formText(form, 'songArtist', 120),
    }
    if (voice instanceof File) {
      if (voice.size <= 0 || voice.size > mediaProcessingLimits.maxVoiceBytes) {
        return NextResponse.json({ error: 'voice size is outside the allowed range.' }, { status: 413 })
      }
      input.voiceWav = await normalizeVoiceAudio(
        Buffer.from(await voice.arrayBuffer()),
        extname(voice.name) || '.webm'
      )
    }

    const result = await analyzeMultimodal(input, {
      apiKey: process.env.MULTIMODAL_API_KEY
        ?? process.env.VISION_API_KEY
        ?? process.env.LLM_API_KEY
        ?? process.env.AI_API_KEY,
      baseUrl: process.env.MULTIMODAL_BASE_URL
        ?? process.env.VISION_BASE_URL
        ?? process.env.LLM_BASE_URL
        ?? process.env.AI_BASE_URL,
      model: process.env.MULTIMODAL_MODEL
        ?? process.env.VISION_MODEL
        ?? process.env.LLM_MODEL
        ?? process.env.AI_MODEL,
      timeoutMs: 60_000,
    })
    console.log('[豆包·情绪认领]', {
      lostItem: result.lostItem,
      claimReason: result.claimReason,
      emotionTags: result.emotionTags,
      status: result.status,
    })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid multimodal request.' },
      { status: 400 }
    )
  }
}
