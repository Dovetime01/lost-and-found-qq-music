import { NextResponse } from 'next/server'
import { analyzeMemorySmart } from '@/lib/aiAnalysis'
import type { ConcertInfo, EvidenceInput } from '@/lib/analysis'
import { qqMusicConfigForRequest } from '@/lib/qqMusicRouteConfig'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      concertInfo?: ConcertInfo
      evidences?: EvidenceInput[]
    }

    if (!body.concertInfo || !Array.isArray(body.evidences)) {
      return NextResponse.json(
        { error: 'concertInfo and evidences are required.' },
        { status: 400 }
      )
    }

    const result = await analyzeMemorySmart(body.concertInfo, body.evidences, {
      apiKey: process.env.LLM_API_KEY ?? process.env.AI_API_KEY ?? process.env.ARK_API_KEY ?? process.env.OPENAI_API_KEY,
      baseUrl: process.env.LLM_BASE_URL ?? process.env.AI_BASE_URL ?? process.env.ARK_BASE_URL ?? process.env.OPENAI_BASE_URL,
      model: process.env.LLM_MODEL ?? process.env.AI_MODEL ?? process.env.ARK_MODEL ?? process.env.OPENAI_MODEL,
      qqMusic: qqMusicConfigForRequest(request),
    })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json(
      { error: 'Invalid analysis request.' },
      { status: 400 }
    )
  }
}
