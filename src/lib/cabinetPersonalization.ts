export interface CabinetPersonalization {
  note: string
  photoDataUrls: string[]
  emotionTags: string[]
}

const CABINET_PERSONALIZATION_KEY = 'lost-and-found.cabinetPersonalization'
const MAX_NOTE_LENGTH = 160
const MAX_PHOTO_CHARS = 700_000
const MAX_PHOTO_TOTAL_CHARS = 2_100_000

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function keyForArchive(archiveId: string) {
  return `${CABINET_PERSONALIZATION_KEY}.${archiveId}`
}

function normalizePersonalization(value: unknown): CabinetPersonalization {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { note: '', photoDataUrls: [], emotionTags: [] }
  }

  const item = value as Partial<CabinetPersonalization>
  const legacyPhoto = (item as Partial<CabinetPersonalization> & { photoDataUrl?: unknown }).photoDataUrl
  return {
    note: typeof item.note === 'string' ? item.note.slice(0, MAX_NOTE_LENGTH) : '',
    photoDataUrls: Array.isArray(item.photoDataUrls)
      ? item.photoDataUrls.filter((url): url is string => typeof url === 'string')
      : typeof legacyPhoto === 'string' && legacyPhoto ? [legacyPhoto] : [],
    emotionTags: Array.isArray(item.emotionTags)
      ? item.emotionTags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0).slice(0, 5)
      : [],
  }
}

function compactPhotoDataUrls(photoDataUrls: string[]) {
  const compacted: string[] = []
  let totalLength = 0

  for (const url of photoDataUrls) {
    if (typeof url !== 'string' || !url.startsWith('data:image/')) continue
    if (url.length > MAX_PHOTO_CHARS) continue
    if (totalLength + url.length > MAX_PHOTO_TOTAL_CHARS) continue
    compacted.push(url)
    totalLength += url.length
    if (compacted.length >= 6) break
  }

  return compacted
}

export function loadCabinetPersonalization(
  archiveId: string,
  storage: Pick<Storage, 'getItem'> = window.localStorage
): CabinetPersonalization {
  try {
    const raw = storage.getItem(keyForArchive(archiveId))
    if (!raw) return { note: '', photoDataUrls: [], emotionTags: [] }

    return normalizePersonalization(JSON.parse(raw) as unknown)
  } catch {
    return { note: '', photoDataUrls: [], emotionTags: [] }
  }
}

export function saveCabinetPersonalization(
  archiveId: string,
  personalization: CabinetPersonalization,
  storage: StorageLike = window.localStorage
): CabinetPersonalization {
  const normalized = normalizePersonalization(personalization)
  const candidates: CabinetPersonalization[] = [
    normalized,
    { ...normalized, photoDataUrls: compactPhotoDataUrls(normalized.photoDataUrls) },
    { ...normalized, photoDataUrls: [] },
  ]

  for (const candidate of candidates) {
    try {
      storage.setItem(
        keyForArchive(archiveId),
        JSON.stringify(candidate)
      )
      return candidate
    } catch (error) {
      void error
    }
  }

  return candidates[candidates.length - 1]
}
