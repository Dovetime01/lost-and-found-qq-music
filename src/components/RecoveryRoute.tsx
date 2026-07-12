'use client'

import { motion, useReducedMotion } from 'framer-motion'
import StarrySeaBackground from '@/components/StarrySeaBackground'
import type { MemoryProfile } from '@/lib/analysis'
import type { AnalysisProviderStatus } from '@/lib/aiAnalysis'
import type { RadioPlaylistResult, RadioStep } from '@/lib/pipelineTypes'

interface RecoveryRouteProps {
  profile: MemoryProfile
  radio?: RadioPlaylistResult | null
  analysisSource: 'ai' | 'rule' | 'fallback'
  analysisProvider: AnalysisProviderStatus
  onNext: () => void
}

const ROUTE_COPY = [
  {
    num: '01',
    chapter: '遗落序章',
    description: '这是你遗失的那一刻',
    accent: '#9E4A4A',
    badgeBg: 'rgba(158, 74, 74, 0.14)',
    badgeBorder: 'rgba(158, 74, 74, 0.45)',
  },
  {
    num: '02',
    chapter: '晚声回响',
    description: '这首歌和你遗失的氛围最共振',
    accent: '#C9A46A',
    badgeBg: 'rgba(201, 164, 106, 0.14)',
    badgeBorder: 'rgba(201, 164, 106, 0.45)',
  },
  {
    num: '03',
    chapter: '缄默心事',
    description: '我们都爱听，那晚的「我们」未曾消失',
    accent: '#5FA8A8',
    badgeBg: 'rgba(95, 168, 168, 0.14)',
    badgeBorder: 'rgba(95, 168, 168, 0.45)',
  },
  {
    num: '04',
    chapter: '独行归途',
    description: '时隔许久再听闻，心境早已不同',
    accent: '#A8A8B0',
    badgeBg: 'rgba(168, 168, 176, 0.12)',
    badgeBorder: 'rgba(168, 168, 176, 0.38)',
  },
  {
    num: '05',
    chapter: '归位终章',
    description: '收下所有遗憾，慢慢走回平凡日常',
    accent: '#B8863E',
    badgeBg: 'rgba(184, 134, 62, 0.14)',
    badgeBorder: 'rgba(184, 134, 62, 0.45)',
  },
] as const

function profileSteps(profile: MemoryProfile): RadioStep[] {
  const stages: RadioStep['stage'][] = ['liveWarmth', 'emotionResonance', 'crowdLoop', 'longUnheard', 'backToReality']
  return profile.playlist.slice(0, 5).map((song, index) => ({
    id: String(song.id),
    stage: stages[index],
    chapter: ROUTE_COPY[index]?.chapter ?? song.chapter,
    title: song.title,
    artist: song.artist,
    duration: song.duration,
    reason: song.reason,
    playUrl: song.playUrl,
    tryUrl: song.tryUrl,
    qqMusicUrl: song.qqMusicUrl,
    coverUrl: song.coverUrl,
    source: song.source,
  }))
}

function VinylIcon({ accent }: { accent: string }) {
  return (
    <div
      className="relative h-12 w-12 flex-none rounded-full shadow-[0_7px_20px_rgba(0,0,0,0.42)]"
      style={{
        background: 'repeating-radial-gradient(circle, #0a0a0a 0, #0a0a0a 3px, #1a1a1a 4px, #080808 6px)',
      }}
    >
      <div
        className="absolute inset-[30%] rounded-full"
        style={{ background: accent, boxShadow: `inset 0 1px 2px rgba(255,255,255,0.25)` }}
      />
      <div className="absolute inset-[44%] rounded-full bg-[#080808]" />
    </div>
  )
}

export default function RecoveryRoute({ profile, radio, onNext }: RecoveryRouteProps) {
  const reduceMotion = useReducedMotion()
  const steps = (radio?.steps?.length ? radio.steps : profileSteps(profile)).slice(0, 5)

  return (
    <main className="relative min-h-full overflow-x-hidden bg-[#06080e] px-5 pb-6 pt-5 text-archive-paper">
      <StarrySeaBackground />

      <header className="relative z-10 text-center">
        <div className="mb-2 inline-block border border-archive-gold/35 px-3 py-0.5">
          <p className="font-serif text-[9px] tracking-[0.27em] text-archive-gold/75">RECOVERY ROUTE</p>
        </div>
        <h1 className="font-serif text-[21px] tracking-wide text-archive-paper">找回路线</h1>
        <p className="mx-auto mt-1.5 max-w-xs text-xs leading-snug text-archive-paper/55">
          请戴好耳机，按顺序聆听回收
        </p>
      </header>

      <ol className="relative z-10 mx-auto mt-4 max-w-sm">
        {steps.map((step, index) => {
          const copy = ROUTE_COPY[index] ?? ROUTE_COPY[ROUTE_COPY.length - 1]
          const isLast = index === steps.length - 1

          return (
            <motion.li
              key={`${step.id}-${index}`}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.07 }}
              className="relative flex gap-3.5"
            >
              {/* 左侧唱片 + 连接线 */}
              <div className="relative flex w-12 flex-none flex-col items-center">
                <VinylIcon accent={copy.accent} />
                {!isLast && (
                  <div
                    className="absolute top-12 bottom-0 w-px"
                    style={{
                      background: 'linear-gradient(180deg, rgba(233,223,200,0.22) 0%, rgba(233,223,200,0.06) 100%)',
                    }}
                  />
                )}
              </div>

              {/* 右侧文案 — 全部直接展示 */}
              <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
                <div
                  className="mb-1.5 inline-block rounded-sm border px-2 py-0.5"
                  style={{
                    background: copy.badgeBg,
                    borderColor: copy.badgeBorder,
                  }}
                >
                  <span className="font-serif text-[10px] tracking-[0.07em]" style={{ color: copy.accent }}>
                    {copy.num} · {copy.chapter}
                  </span>
                </div>

                <h2 className="font-serif text-[17px] leading-snug text-archive-paper">{step.title}</h2>
                <p className="mt-0.5 text-[11px] text-archive-paper/50">
                  {step.artist}{step.duration ? ` · ${step.duration}` : ''}
                </p>
                <p className="mt-1.5 text-xs leading-snug text-archive-paper/60">
                  {copy.description}
                </p>
              </div>
            </motion.li>
          )
        })}
      </ol>

      <div className="relative z-10 mx-auto mt-3 max-w-sm text-center">
        <p className="mb-2.5 line-clamp-2 text-xs leading-snug text-archive-paper/52">
          {radio?.recommendLine ?? `从${profile.dominantEmotion}出发，五首歌以后回到日常。`}
        </p>
        <button
          type="button"
          onClick={onNext}
          className="w-full rounded border border-archive-gold/45 bg-archive-gold py-3 font-serif text-sm tracking-[0.17em] text-[#0D0D0D] shadow-[0_6px_20px_rgba(201,164,106,0.28)]"
        >
          开始播放归途电台
        </button>
      </div>
    </main>
  )
}
