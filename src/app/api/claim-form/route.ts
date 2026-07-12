import { NextResponse } from 'next/server'
import type { ConcertInfo } from '@/lib/analysis'
import { generateClaimForm } from '@/lib/claimFormGeneration'
import type { MultimodalAnalysisResult, SongAnchor } from '@/lib/pipelineTypes'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      concertInfo?: ConcertInfo
      multimodal?: MultimodalAnalysisResult
      anchor?: SongAnchor | null
    }
    if (!body.concertInfo || !body.multimodal) {
      return NextResponse.json(
        { error: 'concertInfo and multimodal are required.' },
        { status: 400 }
      )
    }
    const result = await generateClaimForm({
      concertInfo: body.concertInfo,
      multimodal: body.multimodal,
      anchor: body.anchor,
    }, {
      apiKey: process.env.CLAIM_API_KEY
        ?? process.env.LLM_API_KEY
        ?? process.env.AI_API_KEY,
      baseUrl: process.env.CLAIM_BASE_URL
        ?? process.env.LLM_BASE_URL
        ?? process.env.AI_BASE_URL,
      model: process.env.CLAIM_MODEL
        ?? process.env.LLM_MODEL
        ?? process.env.AI_MODEL,
    })
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Invalid claim form request.' }, { status: 400 })
  }
}
