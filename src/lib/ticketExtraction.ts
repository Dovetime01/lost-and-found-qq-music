import type { ConcertInfo } from './analysis.ts'

export type TicketExtractionSource = 'ocr-ark' | 'local-rule' | 'demo-fallback'

export interface TicketExtractionInput {
  fileName?: string
  imageData?: string
  hintText?: string
}

export interface TicketExtractionResult {
  concertInfo: ConcertInfo
  source: TicketExtractionSource
  confidence: number
  needsReview: boolean
  message: string
  rawText: string
}

interface TicketExtractionConfig {
  baiduApiKey?: string
  baiduSecretKey?: string
  arkApiKey?: string
  arkBaseUrl?: string
  arkModel?: string
  fetcher?: typeof fetch
  timeoutMs?: number
}

interface AiTicketPayload {
  artist?: unknown
  concertName?: unknown
  date?: unknown
  city?: unknown
  venue?: unknown
  confidence?: unknown
  rawText?: unknown
}

interface BaiduTokenCache {
  cacheKey: string
  accessToken: string
  expiresAt: number
}

let baiduTokenCache: BaiduTokenCache | undefined

const DEFAULT_TIMEOUT_MS = 15_000

interface KnownConcert {
  artist: string
  concertName: string
  city: string
  venue: string
  date: string
  keywords: string[]
}

const fallbackConcertInfo: ConcertInfo = {
  concertName: '待确认现场',
  artist: '待确认艺人',
  date: '待确认日期',
  city: '待确认城市',
  venue: '待确认场馆',
}

const knownConcerts: KnownConcert[] = [
  {
    artist: '周杰伦',
    concertName: '嘉年华世界巡回演唱会',
    city: '上海',
    venue: '上海体育场',
    date: '2025.09.12',
    keywords: ['周杰伦', 'jay', 'chou', '嘉年华', '嘉年華'],
  },
  {
    artist: 'Taylor Swift',
    concertName: 'The Eras Tour',
    city: '新加坡',
    venue: 'National Stadium',
    date: '2024.03.08',
    keywords: ['taylor', 'swift', 'eras', '泰勒', '霉霉'],
  },
  {
    artist: '陈奕迅',
    concertName: 'Fear and Dreams 世界巡回演唱会',
    city: '广州',
    venue: '宝能广州国际体育演艺中心',
    date: '2024.12.21',
    keywords: ['陈奕迅', 'eason', 'fear', 'dreams'],
  },
  {
    artist: '梁静茹',
    concertName: '当我们谈论爱情世界巡回演唱会',
    city: '北京',
    venue: '首都体育馆',
    date: '2025.06.14',
    keywords: ['梁静茹', 'fish', 'leong', '爱情'],
  },
  {
    artist: '蔡依林',
    concertName: 'Ugly Beauty 世界巡回演唱会',
    city: '上海',
    venue: '梅赛德斯奔驰文化中心',
    date: '2025.08.16',
    keywords: ['蔡依林', 'jolin', 'tsai', 'ugly', 'beauty'],
  },
  {
    artist: '五月天',
    concertName: '5522+2回到那一天',
    city: '北京',
    venue: '国家体育场-鸟巢',
    date: '2026.05.18',
    keywords: ['五月天', 'mayday', '5522', '回到那一天', '鸟巢'],
  },
]

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, ' ')
}

function scoreConcert(concert: KnownConcert, normalizedText: string) {
  return concert.keywords.filter((keyword) => normalizedText.includes(keyword.toLowerCase())).length
}

function pickKnownConcert(text: string) {
  const normalizedText = normalizeText(text)
  const scored = knownConcerts
    .map((concert) => ({ concert, score: scoreConcert(concert, normalizedText) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)

  return scored[0]
}

function cityFromText(text: string, fallback: string) {
  const cities = ['北京', '上海', '广州', '深圳', '成都', '杭州', '南京', '武汉', '重庆', '西安', '新加坡']
  return cities.find((city) => text.includes(city)) ?? fallback
}

function venueFromText(text: string, fallback: string) {
  const venuePatterns = ['鸟巢', '上海体育场', '国家体育场', '首都体育馆', '梅赛德斯奔驰文化中心', '宝能广州国际体育演艺中心']
  const venue = venuePatterns.find((item) => text.includes(item))
  if (venue === '鸟巢') return '国家体育场-鸟巢'
  return venue ?? fallback
}

function dateFromText(text: string, fallback: string) {
  const dateMatch = text.match(/20\d{2}[./-]\d{1,2}[./-]\d{1,2}/)
  return dateMatch?.[0].replace(/-/g, '.') ?? fallback
}

function asString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function asConfidence(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback
}

function parseAiPayload(content: string): AiTicketPayload {
  const jsonText = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const objectMatch = jsonText.match(/\{[\s\S]*\}/)
  const parsed = JSON.parse(objectMatch?.[0] ?? jsonText) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI ticket response is not an object')
  }
  return parsed as AiTicketPayload
}

function normalizeAiTicketResult(payload: AiTicketPayload, localText: string): TicketExtractionResult {
  const concertInfo: ConcertInfo = {
    artist: asString(payload.artist, fallbackConcertInfo.artist),
    concertName: asString(payload.concertName, fallbackConcertInfo.concertName),
    date: asString(payload.date, fallbackConcertInfo.date),
    city: asString(payload.city, fallbackConcertInfo.city),
    venue: asString(payload.venue, fallbackConcertInfo.venue),
  }

  const needsReview = Object.values(concertInfo).some((value) => value.startsWith('待确认'))

  return {
    concertInfo,
    source: 'ocr-ark',
    confidence: asConfidence(payload.confidence, needsReview ? 0.58 : 0.86),
    needsReview,
    message: needsReview
      ? 'AI 已尝试识别票根信息，请手动补全不确定字段。'
      : 'AI 已根据票根图片识别出演出信息，请确认后继续。',
    rawText: localText,
  }
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetcher(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function getBaiduAccessToken(config: TicketExtractionConfig) {
  const { baiduApiKey, baiduSecretKey } = config
  if (!baiduApiKey || !baiduSecretKey) throw new Error('Baidu OCR credentials are missing')

  const cacheKey = `${baiduApiKey}:${baiduSecretKey}`
  if (baiduTokenCache?.cacheKey === cacheKey && baiduTokenCache.expiresAt > Date.now()) {
    return baiduTokenCache.accessToken
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: baiduApiKey,
    client_secret: baiduSecretKey,
  })
  const fetcher = config.fetcher ?? fetch
  const response = await fetchWithTimeout(
    fetcher,
    `https://aip.baidubce.com/oauth/2.0/token?${params}`,
    { method: 'POST' },
    config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  )
  if (!response.ok) throw new Error(`Baidu token request failed with status ${response.status}`)

  const data = await response.json() as { access_token?: unknown; expires_in?: unknown }
  if (typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('Baidu token response has no access_token')
  }
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 2_592_000
  baiduTokenCache = {
    cacheKey,
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(0, expiresIn - 60) * 1000,
  }
  return data.access_token
}

function stripImageDataPrefix(imageData: string) {
  return imageData.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
}

async function recognizeTicketText(imageData: string, config: TicketExtractionConfig) {
  const accessToken = await getBaiduAccessToken(config)
  const body = new URLSearchParams({ image: stripImageDataPrefix(imageData) })
  const fetcher = config.fetcher ?? fetch
  const response = await fetchWithTimeout(
    fetcher,
    `https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  )
  if (!response.ok) throw new Error(`Baidu OCR request failed with status ${response.status}`)

  const data = await response.json() as {
    words_result?: Array<{ words?: unknown }>
    error_msg?: unknown
  }
  const rawText = data.words_result
    ?.map((item) => typeof item.words === 'string' ? item.words.trim() : '')
    .filter(Boolean)
    .join('\n') ?? ''
  if (!rawText) throw new Error('Baidu OCR response has no recognized text')
  return rawText
}

async function extractConcertInfoWithOcrAndArk(
  input: TicketExtractionInput,
  config: TicketExtractionConfig
): Promise<TicketExtractionResult> {
  if (!config.baiduApiKey || !config.baiduSecretKey || !config.arkApiKey || !config.arkModel || !input.imageData) {
    throw new Error('Ticket OCR configuration or image is missing')
  }

  const fetcher = config.fetcher ?? fetch
  const baseUrl = (config.arkBaseUrl ?? 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')
  const rawText = await recognizeTicketText(input.imageData, config)
  const prompt = `提取以下文字中的演唱会信息，立刻输出JSON，不要思考：\n${rawText}\n格式：{"concertName":"","artist":"","date":"","city":"","venue":""}`

  const response = await fetchWithTimeout(
    fetcher,
    `${baseUrl}/responses`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.arkApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.arkModel,
        input: [{
          role: 'user',
          content: [{ type: 'input_text', text: prompt }],
        }],
      }),
    },
    config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  )

  if (!response.ok) {
    throw new Error(`Ark ticket extraction request failed with status ${response.status}`)
  }

  const data = await response.json() as {
    output?: Array<{ type?: string; content?: Array<{ text?: unknown }> }>
  }
  const messageOutput = data.output?.find((item) => item.type === 'message')
  const content = messageOutput?.content?.find((item) => typeof item.text === 'string')?.text
  if (typeof content !== 'string' || !content) {
    throw new Error('Ark ticket extraction response has no message content')
  }

  return normalizeAiTicketResult(parseAiPayload(content), rawText)
}

export function inferConcertInfoFromText(text: string): TicketExtractionResult {
  const match = pickKnownConcert(text)

  if (!match) {
    return {
      concertInfo: fallbackConcertInfo,
      source: 'demo-fallback',
      confidence: 0.32,
      needsReview: true,
      message: '暂未识别出票根关键信息，请手动确认后继续。',
      rawText: text,
    }
  }

  const { concert } = match
  const concertInfo: ConcertInfo = {
    concertName: concert.concertName,
    artist: concert.artist,
    date: dateFromText(text, concert.date),
    city: cityFromText(text, concert.city),
    venue: venueFromText(text, concert.venue),
  }

  return {
    concertInfo,
    source: 'local-rule',
    confidence: Math.min(0.92, 0.58 + match.score * 0.12),
    needsReview: false,
    message: '已根据票根文件信息生成识别结果，请确认后继续。',
    rawText: text,
  }
}

export async function extractConcertInfoFromTicket(
  input: TicketExtractionInput,
  config: TicketExtractionConfig = {}
): Promise<TicketExtractionResult> {
  const localText = [input.fileName, input.hintText].filter(Boolean).join(' ')

  try {
    return await extractConcertInfoWithOcrAndArk(input, config)
  } catch {
    return inferConcertInfoFromText(localText)
  }
}
