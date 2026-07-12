import type { MultimodalAnalysisResult } from './pipelineTypes.ts'

export const EMOTION_TAG_VOCABULARY = [
  '热烈', '释放', '快乐', '共鸣', '不舍', '遗憾',
  '青春', '回忆', '怀旧', '温柔', '释然', '修复', '自我',
] as const

export const DEFAULT_LOST_ITEM = '那晚留在现场的自己'
export const DEFAULT_CLAIM_REASON = '有些感受不会消失，只是暂时留在音乐里。'
export const DEFAULT_EMOTION_TAGS = ['忧伤']

export interface MultimodalInput {
  photo?: { data: Buffer; mimeType: string }
  videoFrame?: { data: Buffer; mimeType: string }
  voiceWav?: Buffer
  spokenText?: string
  lyrics?: string
  artistName?: string
  concertName?: string
  venue?: string
  city?: string
  ticketOCR?: string
  /** Song recognized from the user's concert video (or manual confirm). */
  songTitle?: string
  songArtist?: string
}

export interface MultimodalConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
  fetcher?: typeof fetch
  timeoutMs?: number
}

function cleanText(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function fieldOrMissing(value: unknown, maxLength = 500) {
  const text = cleanText(value, maxLength)
  return text || '未提供'
}

/** Strip model noise so lostItem fits a single certificate line. */
export function sanitizeLostItem(value: unknown, maxLength = 28) {
  const text = cleanText(value, 120)
    .replace(/^["'「『《]+|["'」』》。.！？!?]+$/g, '')
    .replace(/[*_`#~>|]+/g, '')
    .replace(/\s+/g, '')
  return text.slice(0, maxLength)
}

/**
 * Normalize claimReason for certificate layout:
 * keep at most one soft line break, drop markdown/wrapping quotes.
 */
export function sanitizeClaimReason(value: unknown, maxLength = 120) {
  const text = cleanText(value, 400)
    .replace(/^["'「『]+|["'」』]+$/g, '')
    .replace(/[*_`#~>]+/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
  return (lines.join('\n') || text).slice(0, maxLength)
}

function modalityFlags(input: MultimodalInput) {
  return {
    photo: Boolean(input.photo),
    videoFrame: Boolean(input.videoFrame),
    voice: Boolean(input.voiceWav),
    text: Boolean(input.spokenText?.trim()),
    lyrics: Boolean(input.lyrics?.trim()),
  }
}

function buildEmotionClaimPrompt(input: MultimodalInput) {
  return [
    '你是 QQ 音乐「失物招领处」的情绪认领生成器。',
    '',
    '用户上传了一场演唱会的图片、视频、录音、文字等记忆线索。',
    '',
    '你的任务不是分析这些内容，而是理解它们共同表达的情绪，并帮助用户找回演唱会结束后逐渐消失的感受。',
    '',
    '请充分利用不同模态之间的信息进行联合理解。',
    '',
    '例如：',
    '',
    '- 画面中的灯光、舞台氛围、人物状态',
    '- 视频中的环境声、合唱、掌声、安静等声音变化',
    '- 用户输入的文字',
    '- 歌词表达的主题',
    '- 艺人的创作风格、作品长期表达的情绪气质',
    '',
    '不要孤立分析每一种模态，而要理解它们共同构成的那一晚。',
    '',
    '你的目标不是总结演唱会发生了什么，',
    '',
    '而是回答：',
    '',
    '"这个用户真正留在现场的是什么？"',
    '',
    '请仅输出 JSON：',
    '',
    '{',
    '    "lostItem":"",',
    '    "claimReason":"",',
    '    "emotionTags":[]',
    '}',
    '',
    'lostItem',
    '',
    '一句 6~14 个字。',
    '',
    '表示用户留在现场的一种情绪、一种状态、或者那个夜晚的一部分自己。',
    '',
    '它应该具有共鸣感。',
    '',
    '不要出现：',
    '',
    '音乐',
    '演唱会',
    'AI',
    '照片',
    '视频',
    '',
    '不要解释。',
    '',
    '不要写成长句。',
    '',
    '示例：',
    '',
    '那份舍不得结束的心情',
    '',
    '那个相信青春不会结束的自己',
    '',
    '今晚的热爱',
    '',
    '那份久违的自在',
    '',
    '那个终于和自己和解的人',
    '',
    '那个放声合唱的自己',
    '',
    '那份仍然相信明天的勇气',
    '',
    'claimReason：',
    '',
    '一句 25~60 字。',
    '',
    '它不是总结，',
    '',
    '不是歌词解析，',
    '',
    '不是人生感悟。',
    '',
    '它应该像电影里的旁白。',
    '',
    '它描述的是：',
    '',
    '演唱会已经结束，',
    '',
    '现实已经继续，',
    '',
    '但那个夜晚仍然留在用户身上。',
    '',
    '请充分结合：',
    '',
    '① 用户上传内容体现出的整体氛围',
    '',
    '② 歌曲表达的主题',
    '',
    '③ 艺人的创作风格',
    '',
    '④ 多模态共同体现出的情绪',
    '',
    '不要只提歌名。',
    '',
    '不要只提艺人。',
    '',
    '不要直接引用歌词。',
    '',
    '不要编造视频里的具体动作。',
    '',
    '不要编造不存在的画面。',
    '',
    '不要出现：',
    '',
    '"根据图片"',
    '',
    '"根据录音"',
    '',
    '"AI分析"',
    '',
    '"识别"',
    '',
    '不要鸡汤。',
    '',
    '不要诗歌。',
    '',
    '不要营销文案。',
    '',
    '应该像：',
    '',
    '《花束般的恋爱》',
    '',
    '《深夜食堂》',
    '',
    '《海街日记》',
    '',
    '里的对白。',
    '',
    '一句就够。',
    '',
    '如果歌曲本身具有非常鲜明的主题，',
    '',
    '例如：',
    '',
    '五月天——青春、陪伴、成长、人生、热血',
    '',
    '陈粒——自我、自由、孤独、温柔、治愈',
    '',
    '林俊杰——遗憾、勇敢、成长',
    '',
    '告五人——夏天、朋友、青春、恋爱',
    '',
    '请不要直接描述歌手，',
    '',
    '而是把歌曲表达的主题，',
    '',
    '自然映射到用户演唱会结束后的现实生活。',
    '',
    '例如：',
    '',
    '今天还是照常回到教室，',
    '没有人知道昨晚有八万人陪你唱完了青春。',
    '',
    '世界恢复了平常，',
    '只有耳边还留着那晚一起合唱的回声。',
    '',
    '生活没有暂停，',
    '只是你终于知道，',
    '自己也可以慢一点。',
    '',
    '真正触动人的，',
    '',
    '不是歌曲，',
    '',
    '而是歌曲改变了用户第二天看待生活的方式。',
    '',
    'emotionTags：',
    '仅从以下标签中选择 2~4 个。',
    '',
    '热烈',
    '',
    '释放',
    '',
    '快乐',
    '',
    '共鸣',
    '',
    '不舍',
    '',
    '遗憾',
    '',
    '青春',
    '',
    '回忆',
    '',
    '怀旧',
    '',
    '温柔',
    '',
    '释然',
    '',
    '修复',
    '',
    '自我',
    '',
    '请选择真正能够代表整个多模态内容共同表达的情绪，',
    '',
    '而不是单独来自歌词或图片。',
    '',
    '',
    '请记住：',
    '',
    '用户来到这里，',
    '',
    '不是为了知道演唱会发生了什么。',
    '',
    '而是因为：',
    '',
    '演唱会结束以后，',
    '',
    '那些感受正在慢慢消失。',
    '',
    '你的文字应该像失物招领处递还失物时，',
    '',
    '工作人员说的最后一句话。',
    '',
    '它不会刻意煽情，',
    '',
    '却会让用户觉得：',
    '',
    '"原来我真正想找回的是这个。"',
    '',
    '排版要求（非常重要，用于认领单卡片直接展示）：',
    'lostItem：必须是单行纯文本，6~14 个汉字，不要引号、不要 Markdown、不要换行、不要句号收尾。',
    'claimReason：1~2 句口语旁白；若分两行，中间只用一个换行；不要 Markdown、不要列表、不要用引号包裹整段、不要多余空行。',
    'emotionTags：仅输出短词数组，不要解释。',
    '',
    '======================== 用户提供的内容 ========================',
    '用户口述：',
    fieldOrMissing(input.spokenText, 3_000),
    '',
    '歌词：',
    fieldOrMissing(input.lyrics, 5_000),
    '',
    '======================== 以下是用户本次演唱会的信息 ========================',
    '',
    '演唱会艺人：',
    fieldOrMissing(input.artistName, 120),
    '',
    '演唱会名称：',
    fieldOrMissing(input.concertName, 160),
    '',
    '场馆：',
    fieldOrMissing(input.venue, 160),
    '',
    '城市：',
    fieldOrMissing(input.city, 80),
    '',
    'OCR识别结果：',
    fieldOrMissing(input.ticketOCR, 4_000),
    '',
    '视频识别到的歌曲名：',
    fieldOrMissing(input.songTitle, 120),
    '',
    '视频识别到的歌曲艺人：',
    fieldOrMissing(input.songArtist, 120),
  ].join('\n')
}

export function buildLocalMultimodalResult(input: MultimodalInput): MultimodalAnalysisResult {
  const modalities = modalityFlags(input)
  return {
    lostItem: DEFAULT_LOST_ITEM,
    claimReason: DEFAULT_CLAIM_REASON,
    emotionTags: [...DEFAULT_EMOTION_TAGS],
    modalities,
    status: {
      source: 'rule',
      provider: 'local-rules',
      fallbackUsed: true,
      message: '使用情绪认领默认结果，不臆造缺失模态。',
    },
    summary: DEFAULT_CLAIM_REASON,
    dominantEmotion: DEFAULT_EMOTION_TAGS[0],
    spokenText: cleanText(input.spokenText),
    lyrics: cleanText(input.lyrics),
  }
}

function dataUrl(media: { data: Buffer; mimeType: string }) {
  return `data:${media.mimeType};base64,${media.data.toString('base64')}`
}

function parseJsonObject(content: string) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const match = cleaned.match(/\{[\s\S]*\}/)
  const parsed = JSON.parse(match?.[0] ?? cleaned) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Multimodal response is not a JSON object')
  }
  return parsed as Record<string, unknown>
}

function extractResponsesText(data: {
  output_text?: unknown
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: unknown }> }>
}) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim()
  }
  const messageOutput = data.output?.find((item) => item.type === 'message')
  const textPart = messageOutput?.content?.find((item) => typeof item.text === 'string')?.text
  return typeof textPart === 'string' ? textPart.trim() : ''
}

function normalizeAiResult(
  payload: Record<string, unknown>,
  input: MultimodalInput
): MultimodalAnalysisResult {
  const allowed = new Set<string>(EMOTION_TAG_VOCABULARY)
  const emotionTags = Array.isArray(payload.emotionTags)
    ? payload.emotionTags
      .filter((tag): tag is string => typeof tag === 'string' && allowed.has(tag.trim()))
      .map((tag) => tag.trim())
      .slice(0, 4)
    : []
  const lostItem = sanitizeLostItem(payload.lostItem) || DEFAULT_LOST_ITEM
  const claimReason = sanitizeClaimReason(payload.claimReason) || DEFAULT_CLAIM_REASON
  const resolvedTags = emotionTags.length ? emotionTags : [...DEFAULT_EMOTION_TAGS]

  return {
    lostItem,
    claimReason,
    emotionTags: resolvedTags,
    modalities: modalityFlags(input),
    status: {
      source: 'ai',
      provider: 'doubao-seed-2.0-lite',
      fallbackUsed: false,
    },
    summary: claimReason,
    dominantEmotion: resolvedTags[0],
    spokenText: cleanText(input.spokenText),
    lyrics: cleanText(input.lyrics),
  }
}

export async function analyzeMultimodal(
  input: MultimodalInput,
  config: MultimodalConfig = {}
): Promise<MultimodalAnalysisResult> {
  const fallback = buildLocalMultimodalResult(input)
  if (!config.apiKey || !config.model) return fallback

  // Ark Responses API: input_image + input_text (same shape as the official demo curl).
  const content: Array<Record<string, unknown>> = []
  if (input.photo) {
    content.push({ type: 'input_image', image_url: dataUrl(input.photo) })
  }
  if (input.videoFrame) {
    content.push({ type: 'input_image', image_url: dataUrl(input.videoFrame) })
  }
  const promptParts = [
    '你是 QQ 音乐「失物招领处」的情绪认领生成器，只输出合法 JSON，不要解释。',
    buildEmotionClaimPrompt(input),
  ]
  if (input.voiceWav) {
    promptParts.push('（用户另提供了现场录音，请结合画面与文字理解整体情绪，不要声称完成了语音转写。）')
  }
  content.push({ type: 'input_text', text: promptParts.join('\n\n') })

  const controller = new AbortController()
  const timeoutMs = Math.max(20_000, Math.min(90_000, config.timeoutMs ?? 60_000))
  const timeout = setTimeout(() => {
    controller.abort(new DOMException(`情绪认领请求超时（>${Math.round(timeoutMs / 1000)}s）`, 'AbortError'))
  }, timeoutMs)

  try {
    const baseUrl = (config.baseUrl ?? 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')
    const fetcher = config.fetcher ?? fetch

    async function postResponses(payload: Record<string, unknown>) {
      const response = await fetcher(`${baseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      const raw = typeof response.text === 'function'
        ? await response.text()
        : JSON.stringify(await response.json())
      let data: {
        output_text?: unknown
        output?: Array<{ type?: string; content?: Array<{ type?: string; text?: unknown }> }>
        error?: { message?: string; code?: string }
      } = {}
      try {
        data = raw ? JSON.parse(raw) as typeof data : {}
      } catch {
        data = {}
      }
      return { response, raw, data }
    }

    const inputPayload = [{ role: 'user', content }]
    let { response, raw, data } = await postResponses({
      model: config.model,
      thinking: { type: 'disabled' },
      input: inputPayload,
    })

    if (!response.ok && response.status === 400 && /thinking/i.test(raw)) {
      console.warn('[豆包·情绪认领] thinking 参数不被接受，改用无 thinking 重试')
      ;({ response, raw, data } = await postResponses({
        model: config.model,
        input: inputPayload,
      }))
    }

    if (!response.ok) {
      throw new Error(`Multimodal request failed with status ${response.status}: ${raw.slice(0, 240)}`)
    }

    const message = extractResponsesText(data)
    if (!message) {
      throw new Error(
        data.error?.message
          ? `Ark error: ${data.error.message}`
          : `Multimodal response has no text content: ${raw.slice(0, 240)}`
      )
    }
    return normalizeAiResult(parseJsonObject(message), input)
  } catch (error) {
    const aborted = typeof error === 'object'
      && error !== null
      && 'name' in error
      && (error as { name?: string }).name === 'AbortError'
    const message = aborted
      ? `情绪认领请求超时（>${Math.round(timeoutMs / 1000)}s）`
      : error instanceof Error ? error.message.slice(0, 280) : fallback.status.message
    console.error('[豆包·情绪认领] 请求失败，使用本地兜底:', message)
    return {
      ...fallback,
      status: {
        ...fallback.status,
        message,
      },
    }
  } finally {
    clearTimeout(timeout)
  }
}
