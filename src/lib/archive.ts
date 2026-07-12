import type { MemoryProfile } from './analysis.ts'

export interface ArchiveItem {
  id: string
  userId: string
  title: string
  songTitle: string
  artist: string
  date: string
  emotionTags: string[]
  note: string
  shareText: string
  photoDataUrls: string[]
}

export const LATEST_ARCHIVE_KEY = 'lost-and-found.latestArchive'
export const DEFAULT_ARCHIVE_USER_ID = 'lfu_local_demo'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
const MAX_ARCHIVE_PHOTO_CHARS = 700_000
const MAX_ARCHIVE_PHOTO_TOTAL_CHARS = 1_400_000

interface CreateArchiveOptions {
  userId?: string
  date?: Date
  photoDataUrls?: string[]
}

interface LoadArchiveOptions {
  userId?: string
  storage?: Pick<Storage, 'getItem'>
}

function formatDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}

function createArchiveId(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const seed = Math.abs(
    date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()
  )
  return `LF-${month}${day}-${String(seed).padStart(5, '0')}`
}

function createShareText(profile: MemoryProfile) {
  const tagText = profile.emotionTags.slice(0, 2).join(' / ')
  return `我把${profile.lostItem}暂时放在《${profile.primarySong.title}》里。${tagText ? `那天大概是：${tagText}。` : ''}`
}

function latestArchiveKey(userId: string) {
  return `${LATEST_ARCHIVE_KEY}.${userId}`
}

function compactPhotoDataUrls(photoDataUrls: string[]) {
  const compacted: string[] = []
  let totalLength = 0

  for (const url of photoDataUrls) {
    if (typeof url !== 'string' || !url.startsWith('data:image/')) continue
    if (url.length > MAX_ARCHIVE_PHOTO_CHARS) continue
    if (totalLength + url.length > MAX_ARCHIVE_PHOTO_TOTAL_CHARS) continue
    compacted.push(url)
    totalLength += url.length
    if (compacted.length >= 3) break
  }

  return compacted
}

export function createArchiveItem(
  profile: MemoryProfile,
  options: CreateArchiveOptions = {}
): ArchiveItem {
  const date = options.date ?? new Date()
  const userId = options.userId ?? DEFAULT_ARCHIVE_USER_ID

  return {
    id: createArchiveId(date),
    userId,
    title: profile.lostItem,
    songTitle: profile.primarySong.title,
    artist: profile.primarySong.artist,
    date: formatDate(date),
    emotionTags: profile.emotionTags,
    note: profile.note,
    shareText: createShareText(profile),
    photoDataUrls: options.photoDataUrls ?? [],
  }
}

function isArchiveItem(value: unknown): value is ArchiveItem {
  if (!value || typeof value !== 'object') return false

  const item = value as ArchiveItem
  return typeof item.id === 'string'
    && typeof item.userId === 'string'
    && typeof item.title === 'string'
    && typeof item.songTitle === 'string'
    && typeof item.artist === 'string'
    && typeof item.date === 'string'
    && Array.isArray(item.emotionTags)
    && typeof item.note === 'string'
    && typeof item.shareText === 'string'
    && (item.photoDataUrls === undefined || Array.isArray(item.photoDataUrls))
}

export function saveLatestArchive(item: ArchiveItem, storage: StorageLike = window.localStorage) {
  const candidates: ArchiveItem[] = [
    item,
    { ...item, photoDataUrls: compactPhotoDataUrls(item.photoDataUrls) },
    { ...item, photoDataUrls: [] },
  ]

  for (const candidate of candidates) {
    try {
      const serialized = JSON.stringify(candidate)
      storage.setItem(latestArchiveKey(candidate.userId), serialized)
      storage.setItem(LATEST_ARCHIVE_KEY, serialized)
      return candidate
    } catch (error) {
      void error
    }
  }

  return candidates[candidates.length - 1]
}

export function loadLatestArchive(options: LoadArchiveOptions = {}): ArchiveItem | null {
  const storage = options.storage ?? window.localStorage
  const key = options.userId ? latestArchiveKey(options.userId) : LATEST_ARCHIVE_KEY

  try {
    const raw = storage.getItem(key)
    if (!raw) return null

    const parsed = JSON.parse(raw) as unknown
    return isArchiveItem(parsed)
      ? { ...parsed, photoDataUrls: parsed.photoDataUrls ?? [] }
      : null
  } catch {
    return null
  }
}
