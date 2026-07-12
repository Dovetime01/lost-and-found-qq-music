import { NextResponse } from 'next/server'
import { pollLoginQrCode } from '@/lib/qqMusicClient'

export const runtime = 'nodejs'

const POLL_STATUS: Record<number, string> = {
  0: 'authorized',
  [-10]: 'expired',
  [-11]: 'waiting_scan',
  [-14]: 'cancelled',
  [-16]: 'rate_limited',
  [-18]: 'wechat_auth_revoked',
  [-19]: 'scanned_waiting_confirm',
  27: 'account_restricted',
}

export async function GET(request: Request) {
  const authCode = new URL(request.url).searchParams.get('authCode')?.trim()
  if (!authCode) {
    return NextResponse.json({ ok: false, error: '缺少 authCode' }, { status: 400 })
  }

  try {
    const result = await pollLoginQrCode(authCode)
    const status = POLL_STATUS[result.ret] ?? 'unknown'

    return NextResponse.json({
      ok: true,
      status,
      ...result,
      code:
        result.ret === 0 && result.encryptString?.startsWith('code-')
          ? result.encryptString
          : result.ret === 0
            ? result.encryptString
            : null,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : '轮询授权结果失败',
      },
      { status: 500 }
    )
  }
}
