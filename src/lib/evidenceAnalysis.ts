import {
  summarizeArtifactsForAnalysis,
  type EvidenceArtifact,
} from './evidenceArtifacts.ts'

export type EvidenceAnalysisSource = 'ai' | 'rule' | 'fallback'

export interface EvidenceAnalysisProviderStatus {
  label: string
  canUseVision: boolean
  description: string
}

export interface EvidenceAnalysisResult {
  artifacts: EvidenceArtifact[]
  summaryText: string
  source: EvidenceAnalysisSource
  message: string
  provider: EvidenceAnalysisProviderStatus
}

interface EvidenceAnalysisConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
  fetcher?: typeof fetch
}

interface AiArtifactAnalysisPayload {
  artifactId?: unknown
  aiDescription?: unknown
  atmosphere?: unknown
  emotionTags?: unknown
  confidence?: unknown
}

interface AiEvidencePayload {
  analyses?: unknown
  summaryText?: unknown
}

const aiEvidenceProvider: EvidenceAnalysisProviderStatus = {
  label: 'AI多模态分析',
  canUseVision: true,
  description: '已启用 AI 视觉/文本分析，可读取图片和视频首帧，并结合音频特征与文字线索。',
}

const localEvidenceProvider: EvidenceAnalysisProviderStatus = {
  label: '本地素材描述',
  canUseVision: false,
  description: '当前使用本地规则描述素材；接入支持视觉理解的模型后可生成真实氛围分析。',
}

function asString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function asStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback
  const items = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
  return items.length > 0 ? items : fallback
}

function localDescription(artifact: EvidenceArtifact) {
  if (artifact.type === 'image') {
    return `画面线索来自${artifact.label}，可能记录了现场灯光、人群、舞台和当晚氛围。`
  }
  if (artifact.type === 'video') {
    return `视频线索来自${artifact.label}，将以视频首帧作为视觉理解输入，并保留片段名称：${artifact.content}。`
  }
  if (artifact.type === 'audio') {
    return artifact.extractedText
  }
  return artifact.extractedText
}

function localEmotionTags(text: string) {
  const tags: string[] = []
  if (/开心|激动|燃|热烈|终于|尖叫|灯光|人群/.test(text)) tags.push('热烈', '释放')
  if (/舍不得|不舍|难过|遗憾|哭/.test(text)) tags.push('不舍', '遗憾')
  if (/青春|回忆|以前|从前/.test(text)) tags.push('青春', '回忆')
  if (/温柔|修复|治愈|放下/.test(text)) tags.push('温柔', '修复')
  return Array.from(new Set(tags.length > 0 ? tags : ['怀旧', '温柔'])).slice(0, 4)
}

function analyzeArtifactsLocally(
  artifacts: EvidenceArtifact[],
  source: EvidenceAnalysisSource = 'rule'
): EvidenceAnalysisResult {
  const enriched = artifacts.map((artifact) => {
    const aiDescription = artifact.aiDescription ?? localDescription(artifact)
    return {
      ...artifact,
      aiDescription,
      emotionTags: artifact.emotionTags ?? localEmotionTags(`${artifact.extractedText} ${aiDescription}`),
    }
  })

  return {
    artifacts: enriched,
    summaryText: summarizeArtifactsForAnalysis(enriched),
    source,
    message: localEvidenceProvider.description,
    provider: localEvidenceProvider,
  }
}

function parseAiPayload(content: string): AiEvidencePayload {
  const jsonText = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const objectMatch = jsonText.match(/\{[\s\S]*\}/)
  const parsed = JSON.parse(objectMatch?.[0] ?? jsonText) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI evidence response is not an object')
  }
  return parsed as AiEvidencePayload
}

function normalizeAiResult(
  artifacts: EvidenceArtifact[],
  payload: AiEvidencePayload
): EvidenceAnalysisResult {
  const analyses = Array.isArray(payload.analyses)
    ? payload.analyses.filter((item): item is AiArtifactAnalysisPayload => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : []

  const enriched = artifacts.map((artifact) => {
    const analysis = analyses.find((item) => item.artifactId === artifact.id)
    if (!analysis) return artifact

    const aiDescription = asString(analysis.aiDescription, artifact.aiDescription ?? artifact.extractedText)
    const emotionTags = asStringArray(analysis.emotionTags, artifact.emotionTags ?? localEmotionTags(aiDescription))

    return {
      ...artifact,
      aiDescription,
      emotionTags,
    }
  })

  return {
    artifacts: enriched,
    summaryText: asString(payload.summaryText, summarizeArtifactsForAnalysis(enriched)),
    source: 'ai',
    message: aiEvidenceProvider.description,
    provider: aiEvidenceProvider,
  }
}

function buildEvidencePrompt(artifacts: EvidenceArtifact[]) {
  return [
    '你是一个演唱会记忆产品的多模态线索分析器。',
    '请根据用户上传的图片、视频首帧、音频特征和文字线索生成中文 JSON。',
    '输出必须是纯 JSON，不要 Markdown，不要代码块。',
    'JSON 字段包含 analyses 和 summaryText。',
    'analyses 是数组，每项包含 artifactId, aiDescription, atmosphere, emotionTags, confidence。',
    'emotionTags 选择 1-4 个短标签，例如：热烈、释放、不舍、遗憾、青春、回忆、温柔、修复、怀旧。',
    '',
    `线索摘要：${JSON.stringify(artifacts.map((artifact) => ({
      artifactId: artifact.id,
      type: artifact.type,
      label: artifact.label,
      text: artifact.extractedText,
      audioFeatures: artifact.audioFeatures,
    })))}`
  ].join('\n')
}

function buildMessageContent(artifacts: EvidenceArtifact[]) {
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [
    {
      type: 'text',
      text: buildEvidencePrompt(artifacts),
    },
  ]

  artifacts.forEach((artifact) => {
    const imageUrl = artifact.type === 'image'
      ? artifact.previewUrl
      : artifact.type === 'video'
        ? artifact.visualFrameDataUrl
        : undefined

    if (imageUrl) {
      content.push({
        type: 'image_url',
        image_url: { url: imageUrl },
      })
    }
  })

  return content
}

export async function analyzeEvidenceArtifacts(
  artifacts: EvidenceArtifact[],
  config: EvidenceAnalysisConfig = {}
): Promise<EvidenceAnalysisResult> {
  if (!config.apiKey || !config.model) {
    return analyzeArtifactsLocally(artifacts)
  }

  const fetcher = config.fetcher ?? fetch
  const baseUrl = (config.baseUrl ?? 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')

  try {
    const response = await fetcher(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.45,
        messages: [
          {
            role: 'system',
            content: '你只输出可被 JSON.parse 解析的中文 JSON。',
          },
          {
            role: 'user',
            content: buildMessageContent(artifacts),
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`AI evidence request failed with status ${response.status}`)
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('AI evidence response has no message content')

    return normalizeAiResult(artifacts, parseAiPayload(content))
  } catch {
    return analyzeArtifactsLocally(artifacts, 'fallback')
  }
}
