import type { QQMusicConfig } from './musicRecommendation'
import { qqMusicTokensFromRequest } from './qqMusicSession'

export function qqMusicConfigForRequest(request: Request): QQMusicConfig {
  const tokens = qqMusicTokensFromRequest(request)
  return {
    appId: process.env.QQ_MUSIC_APP_ID,
    appKey: process.env.QQ_MUSIC_APP_KEY,
    baseUrl: process.env.QQ_MUSIC_BASE_URL,
    openAppId: process.env.QQ_MUSIC_OPEN_APP_ID ?? process.env.QQ_MUSIC_APP_ID,
    openId: tokens?.openId ?? process.env.QQ_MUSIC_OPEN_ID,
    accessToken: tokens?.accessToken ?? process.env.QQ_MUSIC_ACCESS_TOKEN,
    deviceId: process.env.QQ_MUSIC_DEVICE_ID,
    clientIp: process.env.QQ_MUSIC_CLIENT_IP,
    loginType: process.env.QQ_MUSIC_LOGIN_TYPE ?? '6',
  }
}
