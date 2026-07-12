import { NextResponse } from 'next/server'
import {
  normalizeArtistPrefetchInput,
  prefetchArtistCatalog,
} from '@/lib/artistPrefetch'
import { qqMusicConfigForRequest } from '@/lib/qqMusicRouteConfig'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { artist?: unknown }
    const artist = normalizeArtistPrefetchInput(body.artist)
    if (!artist) {
      return NextResponse.json({ error: 'artist is required.' }, { status: 400 })
    }

    const result = await prefetchArtistCatalog(artist, qqMusicConfigForRequest(request))

    return NextResponse.json(result)
  } catch {
    return NextResponse.json(
      { error: 'Invalid artist prefetch request.' },
      { status: 400 }
    )
  }
}
