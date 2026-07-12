import { NextResponse } from 'next/server'
import {
  getQQMusicSession,
  publicQQMusicSession,
  QQ_MUSIC_SESSION_COOKIE,
} from '@/lib/qqMusicSession'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const session = getQQMusicSession(request)
  if (!session) {
    const response = NextResponse.json({ authenticated: false })
    response.cookies.delete(QQ_MUSIC_SESSION_COOKIE)
    return response
  }

  return NextResponse.json({
    authenticated: true,
    session: publicQQMusicSession(session),
  })
}
