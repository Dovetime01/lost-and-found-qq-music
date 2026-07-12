import { NextResponse } from 'next/server'
import { QQ_MUSIC_SESSION_COOKIE } from '@/lib/qqMusicSession'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(QQ_MUSIC_SESSION_COOKIE)
  return response
}
