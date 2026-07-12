import type { ConcertInfo } from './analysis.ts'
import {
  DEFAULT_CLAIM_REASON,
  DEFAULT_EMOTION_TAGS,
  DEFAULT_LOST_ITEM,
  sanitizeClaimReason,
  sanitizeLostItem,
} from './multimodalAnalysis.ts'
import type {
  ClaimFormFields,
  MultimodalAnalysisResult,
  SongAnchor,
} from './pipelineTypes.ts'

export interface ClaimFormInput {
  concertInfo: ConcertInfo
  multimodal: MultimodalAnalysisResult
  anchor?: SongAnchor | null
}

export interface ClaimFormConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
  fetcher?: typeof fetch
  timeoutMs?: number
}

export function requiresVagueMode(anchor?: SongAnchor | null) {
  return !anchor
    || !['xfyun', 'acrcloud', 'manual'].includes(anchor.recognitionSource ?? '')
    || anchor.source !== 'qq-music'
    || anchor.source.includes('fallback')
}

/**
 * Maps 情绪认领结果 into the claim card. The multimodal step already generates
 * lostItem / claimReason / emotionTags; this keeps foundLocation and custody
 * from local templates and vagueMode rules.
 */
export async function generateClaimForm(
  input: ClaimFormInput,
  _config: ClaimFormConfig = {}
): Promise<ClaimFormFields> {
  const vagueMode = requiresVagueMode(input.anchor)
  const tags = input.multimodal.emotionTags.length
    ? input.multimodal.emotionTags.slice(0, 4)
    : [...DEFAULT_EMOTION_TAGS]
  const concertPlace = input.concertInfo.venue || input.concertInfo.city || '那场演出'
  const anchorText = vagueMode
    ? '一段仍待确认的现场旋律'
    : `《${input.anchor?.title}》响起的时刻`
  const lostItem = sanitizeLostItem(input.multimodal.lostItem) || DEFAULT_LOST_ITEM
  const claimReason = sanitizeClaimReason(input.multimodal.claimReason) || DEFAULT_CLAIM_REASON
  const foundLocation = vagueMode
    ? `${concertPlace} 的灯光与合唱声之间`
    : `${concertPlace}，${anchorText}`

  return {
    lostItemName: lostItem,
    lostItem,
    foundLocation,
    reflection: claimReason,
    claimReason,
    emotionTags: tags,
    emotionIntensity: Math.max(1, Math.min(10, 5 + Math.min(tags.length, 4))),
    vagueMode,
    status: '未真正遗失',
    custody: vagueMode ? '现场记忆临时保管处' : 'QQ音乐现场记忆档案',
    note: claimReason,
    narrativeLines: claimReason.includes('\n')
      ? claimReason.split('\n').filter(Boolean)
      : [foundLocation, claimReason],
    pipelineStatus: {
      source: input.multimodal.status?.source === 'ai' ? 'ai' : 'rule',
      provider: input.multimodal.status?.provider ?? 'emotion-claim',
      fallbackUsed: Boolean(input.multimodal.status?.fallbackUsed),
      message: input.multimodal.status?.message,
    },
  }
}
