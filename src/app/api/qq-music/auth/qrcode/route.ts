import { NextResponse } from 'next/server'
import { createLoginQrCode, getQQMusicClientConfig } from '@/lib/qqMusicClient'

export const runtime = 'nodejs'

export async function POST() {
  try {
    const config = getQQMusicClientConfig()
    const qr = await createLoginQrCode(config)
    return NextResponse.json({
      ok: true,
      ...qr,
      openAppId: config.openAppId,
      packageName: config.packageName,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : '获取登录二维码失败',
      },
      { status: 500 }
    )
  }
}
