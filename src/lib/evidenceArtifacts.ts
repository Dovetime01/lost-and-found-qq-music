export type EvidenceArtifactType = 'image' | 'video' | 'audio' | 'text'

export interface AudioFeatureSummary {
  averageVolume?: number
  peakVolume?: number
  estimatedPitchHz?: number
  durationSeconds?: number
}

export interface EvidenceArtifact {
  id: string
  type: EvidenceArtifactType
  sourceType: string
  label: string
  content: string
  previewUrl?: string
  visualFrameDataUrl?: string
  audioFeatures?: AudioFeatureSummary
  extractedText: string
  aiDescription?: string
  emotionTags?: string[]
}

export interface EvidenceArtifactInput {
  id: string
  type: string
  label: string
  content: string
  previewUrl?: string | null
  visualFrameDataUrl?: string | null
  audioFeatures?: AudioFeatureSummary
}

function resolveArtifactType(sourceType: string): EvidenceArtifactType {
  if (sourceType === 'photo') return 'image'
  if (sourceType === 'video') return 'video'
  if (sourceType === 'audio') return 'audio'
  return 'text'
}

function describeVolume(value?: number) {
  if (value == null) return '音量未知'
  if (value >= 0.75) return '音量很高'
  if (value >= 0.4) return '音量中等'
  return '音量较低'
}

function describePeak(value?: number) {
  if (value == null) return '峰值未知'
  if (value >= 0.9) return '峰值接近爆发'
  if (value >= 0.6) return '峰值有明显起伏'
  return '峰值较平稳'
}

function describePitch(value?: number) {
  if (value == null) return '音高未知'
  if (value >= 330) return '音高偏高'
  if (value >= 180) return '音高居中'
  return '音高偏低'
}

export function describeAudioFeatures(features: AudioFeatureSummary = {}) {
  const parts = [
    describeVolume(features.averageVolume),
    describePeak(features.peakVolume),
    describePitch(features.estimatedPitchHz),
  ]

  if (features.durationSeconds != null) {
    parts.push(`片段约 ${Math.round(features.durationSeconds)} 秒`)
  }

  return `浏览器音频特征：${parts.join('，')}。`
}

function createExtractedText(input: EvidenceArtifactInput, type: EvidenceArtifactType) {
  if (type === 'text') return input.content
  if (type === 'image') return `用户上传了照片线索：${input.content}。`
  if (type === 'video') return `用户上传了视频线索：${input.content}。视频首帧将作为视觉理解输入。`
  return `用户上传了音频线索：${input.content}。${describeAudioFeatures(input.audioFeatures)}`
}

export function createEvidenceArtifact(input: EvidenceArtifactInput): EvidenceArtifact {
  const type = resolveArtifactType(input.type)
  const artifact: EvidenceArtifact = {
    id: input.id,
    type,
    sourceType: input.type,
    label: input.label,
    content: input.content,
    extractedText: createExtractedText(input, type),
  }

  if (input.previewUrl) artifact.previewUrl = input.previewUrl
  if (input.visualFrameDataUrl) artifact.visualFrameDataUrl = input.visualFrameDataUrl
  if (input.audioFeatures) artifact.audioFeatures = input.audioFeatures

  return artifact
}

export function summarizeArtifactsForAnalysis(artifacts: EvidenceArtifact[]) {
  return artifacts
    .map((artifact) => `${artifact.label}：${artifact.aiDescription ?? artifact.extractedText}`)
    .join('\n')
}
