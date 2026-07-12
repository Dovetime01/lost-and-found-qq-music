import { NextResponse } from 'next/server'
import type { ConcertInfo } from '@/lib/analysis'
import type { ArtistPrefetchResult } from '@/lib/artistPrefetch'
import type { MultimodalAnalysisResult, SongAnchor } from '@/lib/pipelineTypes'
import { assembleRadio } from '@/lib/radioAssembly'
import { qqMusicConfigForRequest } from '@/lib/qqMusicRouteConfig'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      anchor?: SongAnchor | null
      artistCatalog?: ArtistPrefetchResult | null
      multimodal?: MultimodalAnalysisResult | null
      emotionTags?: string[]
      concertInfo?: ConcertInfo
    }
    if (!body.concertInfo) {
      return NextResponse.json({ error: 'concertInfo is required.' }, { status: 400 })
    }
    const result = await assembleRadio({
      anchor: body.anchor,
      artistCatalog: body.artistCatalog,
      multimodal: body.multimodal,
      emotionTags: body.emotionTags,
      concertInfo: body.concertInfo,
    }, {
      qqMusic: qqMusicConfigForRequest(request),
      apiKey: process.env.RADIO_API_KEY
        ?? process.env.LLM_API_KEY
        ?? process.env.AI_API_KEY,
      baseUrl: process.env.RADIO_BASE_URL
        ?? process.env.LLM_BASE_URL
        ?? process.env.AI_BASE_URL,
      model: process.env.RADIO_MODEL
        ?? process.env.LLM_MODEL
        ?? process.env.AI_MODEL,
    })
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Invalid radio request.' }, { status: 400 })
  }
}
