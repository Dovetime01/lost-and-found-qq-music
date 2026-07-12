export type PipelineSource = 'ai' | 'rule' | 'qq-music' | 'xfyun' | 'fallback'

export interface PipelineStatus {
  source: PipelineSource | string
  provider: string
  fallbackUsed: boolean
  message?: string
}

export interface SongAnchor {
  /** QQ Music song id. A Xunfei recognition id is never exposed as this field. */
  id?: string
  songMid?: string
  title: string
  artist: string
  album?: string
  duration?: string
  coverUrl?: string
  playUrl?: string
  tryUrl?: string
  qqMusicUrl?: string
  source?: string
  recognitionSource?: 'acrcloud' | 'xfyun' | 'manual' | 'fallback'
  confidence?: number
}

/** Emotion-claim output from the multimodal / 情绪认领生成器. */
export interface LostFoundResult {
  lostItem: string
  claimReason: string
  emotionTags: string[]
}

export interface MultimodalAnalysisResult extends LostFoundResult {
  modalities: {
    photo: boolean
    videoFrame: boolean
    voice: boolean
    text: boolean
    lyrics: boolean
  }
  status: PipelineStatus
  /** Compatibility aliases used by the existing UI pipeline. */
  summary?: string
  dominantEmotion?: string
  spokenText?: string
  lyrics?: string
}

export interface ClaimFormFields {
  lostItemName: string
  foundLocation: string
  reflection: string
  claimReason: string
  emotionTags: string[]
  emotionIntensity: number
  vagueMode: boolean
  status: string
  custody: string
  /** Compatibility aliases used by the current claim card. */
  lostItem: string
  note: string
  narrativeLines?: string[]
  pipelineStatus: PipelineStatus
}

export type RadioStage =
  | 'liveWarmth'
  | 'emotionResonance'
  | 'crowdLoop'
  | 'longUnheard'
  | 'backToReality'

export interface RadioStep {
  id: string
  stage: RadioStage
  chapter: string
  title: string
  artist: string
  duration?: string
  reason?: string
  playUrl?: string
  tryUrl?: string
  qqMusicUrl?: string
  coverUrl?: string
  source?: string
}

export interface RadioPlaylistResult {
  playlist: RadioStep[]
  introCopy: string
  recommendLines: string[]
  status: PipelineStatus
  /** Compatibility aliases used by the existing player. */
  intro: string
  recommendLine: string
  steps: RadioStep[]
}

export interface EvidenceMediaBundle {
  photo?: File | Blob
  video?: File
  videoFrame?: Blob
  videoFrameDataUrl?: string
  voice?: File | Blob
  spokenText?: string
  lyrics?: string
  videoDuration?: number
}
