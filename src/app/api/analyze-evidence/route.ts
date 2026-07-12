import { NextResponse } from 'next/server'
import { analyzeEvidenceArtifacts } from '@/lib/evidenceAnalysis'
import type { EvidenceArtifact } from '@/lib/evidenceArtifacts'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      artifacts?: EvidenceArtifact[]
    }

    if (!Array.isArray(body.artifacts)) {
      return NextResponse.json(
        { error: 'artifacts are required.' },
        { status: 400 }
      )
    }

    const result = await analyzeEvidenceArtifacts(body.artifacts, {
      apiKey: process.env.VISION_API_KEY ?? process.env.AI_API_KEY ?? process.env.ARK_API_KEY ?? process.env.OPENAI_API_KEY,
      baseUrl: process.env.VISION_BASE_URL ?? process.env.AI_BASE_URL ?? process.env.ARK_BASE_URL ?? process.env.OPENAI_BASE_URL,
      model: process.env.VISION_MODEL ?? process.env.AI_MODEL ?? process.env.ARK_MODEL ?? process.env.OPENAI_MODEL,
    })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json(
      { error: 'Invalid evidence analysis request.' },
      { status: 400 }
    )
  }
}
