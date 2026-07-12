import type { ArchiveItem } from './archive.ts'

export interface PublicWallNote {
  id: string
  userId: string
  content: string
  city: string
  date: string
  likes: number
  isCurrent?: boolean
}

export interface PublicWallProviderStatus {
  connected: boolean
  label: string
  description: string
}

export interface PublicWallListResult {
  notes: PublicWallNote[]
  source: 'supabase' | 'demo' | 'fallback'
  provider: PublicWallProviderStatus
}

export interface PublicWallPublishResult {
  note: PublicWallNote
  source: 'supabase' | 'demo' | 'fallback'
  provider: PublicWallProviderStatus
}

interface PublicWallConfig {
  supabaseUrl?: string
  supabaseAnonKey?: string
  fetcher?: typeof fetch
}

interface SupabaseWallRow {
  id?: unknown
  user_id?: unknown
  content?: unknown
  city?: unknown
  likes?: unknown
  created_at?: unknown
}

const supabaseProvider: PublicWallProviderStatus = {
  connected: true,
  label: 'Supabase 留言墙',
  description: '已连接 Supabase，留言会真实发布和拉取。',
}

const demoProvider: PublicWallProviderStatus = {
  connected: false,
  label: '本地示例留言墙',
  description: '当前未配置 Supabase，使用本地示例留言；配置后可真实发布。',
}

const demoNotes: PublicWallNote[] = [
  {
    id: 'demo-1',
    userId: 'demo',
    content: '《晴天》前奏响起的时候，我突然想起了一个很久没联系的人。',
    city: '北京',
    date: '2024.03.10',
    likes: 234,
  },
  {
    id: 'demo-2',
    userId: 'demo',
    content: '万人合唱的时候，我没拍视频，只记得自己也唱得很大声。',
    city: '上海',
    date: '2024.03.08',
    likes: 189,
  },
  {
    id: 'demo-3',
    userId: 'demo',
    content: '散场以后走了很久，耳机里还是那一句。',
    city: '广州',
    date: '2024.03.05',
    likes: 156,
  },
  {
    id: 'demo-4',
    userId: 'demo',
    content: '那首歌快结束的时候，我终于没有再低头看手机。',
    city: '深圳',
    date: '2024.03.01',
    likes: 312,
  },
  {
    id: 'demo-5',
    userId: 'demo',
    content: '听到《稻香》的时候，突然很想给家里打个电话。',
    city: '成都',
    date: '2024.02.28',
    likes: 178,
  },
  {
    id: 'demo-6',
    userId: 'demo',
    content: '最后一首结束以后，大家都慢慢安静下来。',
    city: '杭州',
    date: '2024.02.25',
    likes: 245,
  },
]

function hasSupabaseConfig(config: PublicWallConfig) {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey)
}

function normalizeSupabaseUrl(url: string) {
  return url.replace(/\/$/, '')
}

function formatDate(value: unknown) {
  const date = typeof value === 'string' ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return '未知日期'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}

function asString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function mapRowToNote(row: SupabaseWallRow): PublicWallNote {
  return {
    id: asString(row.id, `note-${Date.now()}`),
    userId: asString(row.user_id, 'anonymous'),
    content: asString(row.content, '这条留言暂时无法显示。'),
    city: asString(row.city, '匿名归途'),
    date: formatDate(row.created_at),
    likes: asNumber(row.likes, 0),
  }
}

export function createWallNoteFromArchive(item: ArchiveItem): PublicWallNote {
  return {
    id: item.id,
    userId: item.userId,
    content: item.shareText,
    city: '匿名归途',
    date: item.date,
    likes: 1,
    isCurrent: true,
  }
}

export function getDemoPublicWallNotes(): PublicWallNote[] {
  return demoNotes
}

export async function listPublicWallNotes(config: PublicWallConfig = {}): Promise<PublicWallListResult> {
  if (!hasSupabaseConfig(config)) {
    return {
      notes: getDemoPublicWallNotes(),
      source: 'demo',
      provider: demoProvider,
    }
  }

  const fetcher = config.fetcher ?? fetch
  const baseUrl = normalizeSupabaseUrl(config.supabaseUrl!)

  try {
    const response = await fetcher(
      `${baseUrl}/rest/v1/public_lost_notes?select=*&order=created_at.desc&limit=30`,
      {
        method: 'GET',
        headers: {
          apikey: config.supabaseAnonKey!,
          Authorization: `Bearer ${config.supabaseAnonKey}`,
        },
      }
    )

    if (!response.ok) throw new Error(`Supabase list failed with status ${response.status}`)

    const rows = await response.json() as SupabaseWallRow[]
    return {
      notes: rows.map(mapRowToNote),
      source: 'supabase',
      provider: supabaseProvider,
    }
  } catch {
    return {
      notes: getDemoPublicWallNotes(),
      source: 'fallback',
      provider: demoProvider,
    }
  }
}

export async function publishPublicWallNote(
  note: PublicWallNote,
  config: PublicWallConfig = {}
): Promise<PublicWallPublishResult> {
  if (!hasSupabaseConfig(config)) {
    return {
      note,
      source: 'demo',
      provider: demoProvider,
    }
  }

  const fetcher = config.fetcher ?? fetch
  const baseUrl = normalizeSupabaseUrl(config.supabaseUrl!)

  try {
    const response = await fetcher(`${baseUrl}/rest/v1/public_lost_notes`, {
      method: 'POST',
      headers: {
        apikey: config.supabaseAnonKey!,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        user_id: note.userId,
        content: note.content,
        city: note.city,
        likes: note.likes,
      }),
    })

    if (!response.ok) throw new Error(`Supabase publish failed with status ${response.status}`)

    const rows = await response.json() as SupabaseWallRow[]
    return {
      note: mapRowToNote(rows[0] ?? {}),
      source: 'supabase',
      provider: supabaseProvider,
    }
  } catch {
    return {
      note,
      source: 'fallback',
      provider: demoProvider,
    }
  }
}
