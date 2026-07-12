import { NextResponse } from 'next/server'
import {
  listPublicWallNotes,
  publishPublicWallNote,
  type PublicWallNote,
} from '@/lib/publicWall'

function getSupabaseConfig() {
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  }
}

export async function GET() {
  const result = await listPublicWallNotes(getSupabaseConfig())
  return NextResponse.json(result)
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      note?: PublicWallNote
    }

    if (!body.note) {
      return NextResponse.json(
        { error: 'note is required.' },
        { status: 400 }
      )
    }

    const result = await publishPublicWallNote(body.note, getSupabaseConfig())
    return NextResponse.json(result)
  } catch {
    return NextResponse.json(
      { error: 'Invalid public wall request.' },
      { status: 400 }
    )
  }
}
