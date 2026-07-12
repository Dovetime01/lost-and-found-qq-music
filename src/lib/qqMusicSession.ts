import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'
import type { QQMusicAuthTokens } from './qqMusicClient'
import type { QQMusicAccessLevel, QQMusicUserSession } from './qqMusicAuthTypes'

export const QQ_MUSIC_SESSION_COOKIE = 'lost_found_qq_music'

interface StoredQQMusicSession extends QQMusicUserSession {
  openId: string
  accessToken: string
  refreshToken?: string
}

function sessionKey() {
  const secret = process.env.QQ_MUSIC_SESSION_SECRET?.trim()
    || process.env.QQ_MUSIC_APP_KEY?.trim()
  if (!secret) throw new Error('缺少 QQ_MUSIC_SESSION_SECRET 或 QQ_MUSIC_APP_KEY')
  return createHash('sha256').update(`lost-found-qq-session:${secret}`).digest()
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie') ?? ''
  for (const part of cookieHeader.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return null
}

export function encryptQQMusicSession(session: StoredQQMusicSession) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', sessionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

export function getQQMusicSession(request: Request): StoredQQMusicSession | null {
  const raw = readCookie(request, QQ_MUSIC_SESSION_COOKIE)
  if (!raw) return null

  try {
    const packed = Buffer.from(raw, 'base64url')
    const iv = packed.subarray(0, 12)
    const tag = packed.subarray(12, 28)
    const encrypted = packed.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', sessionKey(), iv)
    decipher.setAuthTag(tag)
    const parsed = JSON.parse(
      Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    ) as StoredQQMusicSession

    if (parsed.expiresAt && parsed.expiresAt <= Math.floor(Date.now() / 1000)) return null
    if (!parsed.openId || !parsed.accessToken) return null
    return parsed
  } catch {
    return null
  }
}

export function publicQQMusicSession(
  session: StoredQQMusicSession
): QQMusicUserSession {
  return {
    nickname: session.nickname,
    avatarUrl: session.avatarUrl,
    accessLevel: session.accessLevel,
    accessLabel: session.accessLabel,
    expiresAt: session.expiresAt,
  }
}

export function createStoredQQMusicSession(input: {
  tokens: QQMusicAuthTokens
  nickname?: string
  avatarUrl?: string
  accessLevel: QQMusicAccessLevel
}) {
  const accessLabel = input.accessLevel === 'full'
    ? '完整播放可用'
    : input.accessLevel === 'preview'
      ? '试听权益'
      : 'QQ音乐已授权'

  return {
    openId: input.tokens.openId,
    accessToken: input.tokens.accessToken,
    refreshToken: input.tokens.refreshToken,
    expiresAt: input.tokens.expireTime ?? Math.floor(Date.now() / 1000) + 86_400,
    nickname: input.nickname?.trim() || 'QQ音乐用户',
    avatarUrl: input.avatarUrl?.trim() || '',
    accessLevel: input.accessLevel,
    accessLabel,
  } satisfies StoredQQMusicSession
}

export function qqMusicTokensFromRequest(request: Request): QQMusicAuthTokens | null {
  const session = getQQMusicSession(request)
  if (!session) return null
  return {
    openId: session.openId,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expireTime: session.expiresAt ?? undefined,
  }
}
