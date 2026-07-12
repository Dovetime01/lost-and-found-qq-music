export type QQMusicAccessLevel = 'full' | 'preview' | 'authorized'

export interface QQMusicUserSession {
  nickname: string
  avatarUrl: string
  accessLevel: QQMusicAccessLevel
  accessLabel: string
  expiresAt: number | null
}

export interface QQMusicAuthResult {
  ok: true
  session: QQMusicUserSession
}

export interface QQMusicPublicSession {
  nickname: string
  avatarUrl: string
  openIdHint: string
  accessLevel: QQMusicAccessLevel
  accessLabel: string
  expiresAt: number | null
}

export interface QQMusicSessionResponse {
  authenticated: boolean
  user: QQMusicPublicSession | null
}
