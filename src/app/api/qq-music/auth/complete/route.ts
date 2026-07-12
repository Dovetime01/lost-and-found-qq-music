import { NextResponse } from 'next/server'
import {
  callQQMusicApi,
  exchangeAccessToken,
  getQQMusicClientConfig,
  probePlayPermission,
} from '@/lib/qqMusicClient'
import {
  createStoredQQMusicSession,
  encryptQQMusicSession,
  publicQQMusicSession,
  QQ_MUSIC_SESSION_COOKIE,
} from '@/lib/qqMusicSession'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string; query?: string }
    const code = body.code?.trim()
    if (!code) {
      return NextResponse.json({ ok: false, error: '缺少授权 code' }, { status: 400 })
    }

    const config = getQQMusicClientConfig()
    const tokens = await exchangeAccessToken(code, config)
    const probe = await probePlayPermission(
      tokens,
      body.query?.trim() || '李荣浩 恋人',
      config
    )

    let account: { nickname?: string; headimgurl?: string } | null = null
    try {
      const info = await callQQMusicApi(
        'fcg_music_custom_get_account_info.fcg',
        {
          login_type: 6,
          qqmusic_open_appid: config.openAppId,
          qqmusic_open_id: tokens.openId,
          qqmusic_access_token: tokens.accessToken,
        },
        config
      )
      const userInfo = info.user_info
      if (userInfo && typeof userInfo === 'object') {
        account = {
          nickname: String((userInfo as { nickname?: unknown }).nickname ?? ''),
          headimgurl: String((userInfo as { headimgurl?: unknown }).headimgurl ?? ''),
        }
      }
    } catch {
      account = null
    }

    const hasFullPlayback = probe.tracks.some((track) => track.hasSongPlayUrl)
    const hasPreview = probe.tracks.some((track) => track.hasTry30sUrl)
    const session = createStoredQQMusicSession({
      tokens,
      nickname: account?.nickname,
      avatarUrl: account?.headimgurl,
      accessLevel: hasFullPlayback ? 'full' : hasPreview ? 'preview' : 'authorized',
    })
    const response = NextResponse.json({
      ok: true,
      session: publicQQMusicSession(session),
    })
    response.cookies.set(QQ_MUSIC_SESSION_COOKIE, encryptQQMusicSession(session), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: Math.max(60, (session.expiresAt ?? 0) - Math.floor(Date.now() / 1000)),
    })
    return response
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : '完成登录失败',
      },
      { status: 500 }
    )
  }
}
