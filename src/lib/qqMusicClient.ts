import { createHmac } from 'node:crypto'

export interface QQMusicClientConfig {
  appId: string
  appKey: string
  baseUrl: string
  openAppId: string
  packageName: string
  deviceName: string
  clientIp?: string
}

export interface QQMusicAuthTokens {
  openId: string
  accessToken: string
  refreshToken?: string
  expireTime?: number
}

export function getQQMusicClientConfig(): QQMusicClientConfig {
  const appId = process.env.QQ_MUSIC_APP_ID?.trim()
  const appKey = process.env.QQ_MUSIC_APP_KEY?.trim()
  const baseUrl = process.env.QQ_MUSIC_BASE_URL?.trim()

  if (!appId || !appKey || !baseUrl) {
    throw new Error('缺少 QQ_MUSIC_APP_ID / QQ_MUSIC_APP_KEY / QQ_MUSIC_BASE_URL')
  }

  return {
    appId,
    appKey,
    baseUrl,
    openAppId: process.env.QQ_MUSIC_OPEN_APP_ID?.trim() || appId,
    packageName: process.env.QQ_MUSIC_PACKAGE_NAME?.trim() || 'lost-and-found-share',
    deviceName: process.env.QQ_MUSIC_DEV_NAME?.trim() || 'LostFoundDemo',
    clientIp: process.env.QQ_MUSIC_CLIENT_IP?.trim() || undefined,
  }
}

function createSignature(queryString: string, appKey: string, cookie = '') {
  return createHmac('sha256', appKey)
    .update(`${queryString}&cookie=${cookie}`)
    .digest('hex')
    .toLowerCase()
}

export async function callQQMusicApi(
  opiCmd: string,
  extra: Record<string, string | number | undefined>,
  config: QQMusicClientConfig = getQQMusicClientConfig()
) {
  const params = new URLSearchParams()
  params.set('opi_cmd', opiCmd)
  params.set('app_id', config.appId)
  params.set('timestamp', Math.floor(Date.now() / 1000).toString())

  if (config.clientIp) params.set('client_ip', config.clientIp)

  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined || value === '') continue
    params.set(key, String(value))
  }

  const queryString = params.toString()
  const url = `${config.baseUrl.replace(/\?+$/, '')}?${queryString}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-QYOPI-Sign': createSignature(queryString, config.appKey),
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  const text = await response.text()
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`QQ Music 返回非 JSON（HTTP ${response.status}）`)
  }

  if (!response.ok) {
    throw new Error(`QQ Music HTTP ${response.status}: ${String(payload.msg ?? text.slice(0, 200))}`)
  }

  return payload
}

export async function createLoginQrCode(config: QQMusicClientConfig = getQQMusicClientConfig()) {
  const encryptAuth = JSON.stringify({
    response_type: 'code',
    state: String(Date.now()).slice(-10),
  })

  const payload = await callQQMusicApi(
    'fcg_music_custom_sdk_get_qr_code.fcg',
    {
      qqmusic_open_appid: config.openAppId,
      qqmusic_package_name: config.packageName,
      qqmusic_dev_name: config.deviceName,
      qqmusic_qrcode_type: 'universal',
      qqmusic_encrypt_auth: encryptAuth,
    },
    config
  )

  const ret = Number(payload.ret ?? -1)
  if (ret !== 0) {
    throw new Error(`获取二维码失败：ret=${ret} ${String(payload.msg ?? '')}`)
  }

  return {
    sdkQrCode: String(payload.sdk_qr_code ?? ''),
    authCode: String(payload.auth_code ?? ''),
    tipContent: String(payload.tip_content ?? '请使用 QQ音乐 / 微信 / QQ 扫码授权'),
    authorizeUrl: String(payload.authorize_url ?? payload.sdk_qr_code ?? ''),
    qrcodeExpireSecond: Number(payload.qrcode_expire_second ?? 600),
    authExpireSecond: Number(payload.auth_expire_second ?? 0),
  }
}

export async function pollLoginQrCode(
  authCode: string,
  config: QQMusicClientConfig = getQQMusicClientConfig()
) {
  const payload = await callQQMusicApi(
    'fcg_music_custom_qrcode_auth_poll.fcg',
    {
      qqmusic_openid_appId: config.openAppId,
      qqmusic_openid_authCode: authCode,
      state: String(Math.floor(Date.now() / 1000)),
    },
    config
  )

  const ret = Number(payload.ret ?? -1)
  return {
    ret,
    subRet: Number(payload.sub_ret ?? 0),
    msg: String(payload.msg ?? ''),
    encryptString: payload.encryptString ? String(payload.encryptString) : null,
  }
}

export async function exchangeAccessToken(
  code: string,
  config: QQMusicClientConfig = getQQMusicClientConfig()
): Promise<QQMusicAuthTokens> {
  const payload = await callQQMusicApi(
    'fcg_music_oauth_get_accesstoken.fcg',
    {
      cmd: 'getToken',
      app_key: config.appKey,
      code,
    },
    config
  )

  const ret = Number(payload.ret ?? -1)
  if (ret !== 0) {
    throw new Error(`换取 token 失败：ret=${ret} ${String(payload.msg ?? '')}`)
  }

  const raw = String(payload.encryptString ?? '')
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error('token 返回格式异常')
  }

  const openId = String(parsed.qqmusic_open_id ?? '')
  const accessToken = String(parsed.qqmusic_access_token ?? '')
  if (!openId || !accessToken) {
    throw new Error('token 响应缺少 open_id / access_token')
  }

  return {
    openId,
    accessToken,
    refreshToken: parsed.qqmusic_refresh_token ? String(parsed.qqmusic_refresh_token) : undefined,
    expireTime: parsed.expireTime ? Number(parsed.expireTime) : undefined,
  }
}

export interface PlayProbeTrack {
  title: string
  artist: string
  userOwnRule: number | null
  playable: number | null
  tryPlayable: number | null
  hasTry30sUrl: boolean
  hasSongPlayUrl: boolean
  try30sUrl: string | null
  songPlayUrl: string | null
  unplayableCode: number | null
  unplayableMsg: string | null
  qqMusicUrl: string | null
}

function pickFirstUrl(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export async function probePlayPermission(
  tokens: QQMusicAuthTokens,
  query = '李荣浩 恋人',
  config: QQMusicClientConfig = getQQMusicClientConfig()
) {
  const payload = await callQQMusicApi(
    'fcg_music_custom_search.fcg',
    {
      login_type: 6,
      qqmusic_open_appid: config.openAppId,
      qqmusic_open_id: tokens.openId,
      qqmusic_access_token: tokens.accessToken,
      device_id: 'lost-found-login-probe',
      w: query,
      p: 1,
      num: 5,
      t: 0,
    },
    config
  )

  const ret = Number(payload.ret ?? -1)
  const listCandidate =
    (Array.isArray(payload.list) && payload.list) ||
    (Array.isArray(payload.songlist) && payload.songlist) ||
    (payload.data &&
      typeof payload.data === 'object' &&
      Array.isArray((payload.data as { list?: unknown[] }).list) &&
      (payload.data as { list: unknown[] }).list) ||
    []

  const tracks: PlayProbeTrack[] = (listCandidate as Record<string, unknown>[]).slice(0, 5).map((track) => {
    const try30sUrl = pickFirstUrl(track.try_30s_url)
    const songPlayUrl = pickFirstUrl(
      track.song_play_url,
      track.song_play_url_standard,
      track.song_play_url_hq
    )

    return {
      title: String(track.song_name ?? track.song_title ?? track.title ?? '未知歌曲'),
      artist: String(track.singer_name ?? track.author ?? '未知歌手'),
      userOwnRule: track.user_own_rule == null ? null : Number(track.user_own_rule),
      playable: track.playable == null ? null : Number(track.playable),
      tryPlayable: track.try_playable == null ? null : Number(track.try_playable),
      hasTry30sUrl: Boolean(try30sUrl),
      hasSongPlayUrl: Boolean(songPlayUrl),
      try30sUrl,
      songPlayUrl,
      unplayableCode: track.unplayable_code == null ? null : Number(track.unplayable_code),
      unplayableMsg: track.unplayable_msg == null ? null : String(track.unplayable_msg),
      qqMusicUrl: pickFirstUrl(track.song_h5_url),
    }
  })

  const canPlayAny = tracks.some(
    (track) =>
      track.userOwnRule === 1 ||
      track.playable === 1 ||
      track.tryPlayable === 1 ||
      track.hasTry30sUrl ||
      track.hasSongPlayUrl
  )

  return {
    ret,
    subRet: Number(payload.sub_ret ?? 0),
    msg: String(payload.msg ?? ''),
    query,
    canPlayAny,
    tracks,
  }
}
