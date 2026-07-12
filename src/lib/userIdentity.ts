export interface LocalUserIdentity {
  id: string
  createdAt: string
  label: string
}

export const LOCAL_USER_IDENTITY_KEY = 'lost-and-found.localUserIdentity'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

interface IdentityOptions {
  now?: Date
  random?: () => number
}

function createUserId(now: Date, random: () => number) {
  const timePart = now.getTime().toString(36)
  const randomPart = Math.floor(random() * 1_000_000_000).toString(36).padStart(6, '0')
  return `lfu_${timePart}_${randomPart}`
}

function createLabel(id: string) {
  return `访客 ${id.slice(-4).toUpperCase()}`
}

function isLocalUserIdentity(value: unknown): value is LocalUserIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const identity = value as LocalUserIdentity
  return typeof identity.id === 'string'
    && identity.id.startsWith('lfu_')
    && typeof identity.createdAt === 'string'
    && typeof identity.label === 'string'
}

export function getOrCreateLocalUserIdentity(
  storage: StorageLike = window.localStorage,
  options: IdentityOptions = {}
): LocalUserIdentity {
  try {
    const raw = storage.getItem(LOCAL_USER_IDENTITY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (isLocalUserIdentity(parsed)) return parsed
    }
  } catch {
    // Invalid local identity is replaced below.
  }

  const now = options.now ?? new Date()
  const random = options.random ?? Math.random
  const id = createUserId(now, random)
  const identity: LocalUserIdentity = {
    id,
    createdAt: now.toISOString(),
    label: createLabel(id),
  }

  storage.setItem(LOCAL_USER_IDENTITY_KEY, JSON.stringify(identity))
  return identity
}
