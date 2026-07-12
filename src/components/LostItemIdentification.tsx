'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import type { ConcertInfo, MemoryProfile } from '@/lib/analysis'
import type { ClaimFormFields } from '@/lib/pipelineTypes'

interface LostItemIdentificationProps {
  profile: MemoryProfile
  concertInfo: ConcertInfo
  claim?: ClaimFormFields | null
  onNext: () => void
}

function foundLocationText(concertInfo: ConcertInfo) {
  const artist = concertInfo.artist?.trim()
  const place = (concertInfo.venue || concertInfo.city || '').trim()
  if (artist && place) return `${artist} · ${place}`
  if (artist) return artist
  if (place) return place
  return '待确认现场'
}

function Field({
  label,
  children,
  emphasize = false,
}: {
  label: string
  children: ReactNode
  emphasize?: boolean
}) {
  return (
    <div className="relative pl-3">
      <span className="absolute bottom-1 left-0 top-1 w-px bg-[#3B2A22]/18" />
      <p className="mb-1.5 text-[10px] tracking-[0.22em] text-[#3B2A22]/45">{label}</p>
      <div
        className={
          emphasize
            ? 'font-serif text-[16px] leading-snug tracking-[0.04em] text-[#2A1F1A]'
            : 'font-serif text-[12.5px] leading-[1.75] tracking-[0.02em] text-[#3B2A22]/88'
        }
      >
        {children}
      </div>
    </div>
  )
}

export default function LostItemIdentification({
  profile,
  concertInfo,
  claim,
  onNext,
}: LostItemIdentificationProps) {
  const lostItem = claim?.lostItem ?? profile.lostItem ?? '（待填写）'
  const claimReason = claim?.claimReason ?? claim?.reflection ?? claim?.note ?? profile.note ?? '（待填写）'
  const foundLocation = foundLocationText(concertInfo)
  const emotionTags = (claim?.emotionTags?.length ? claim.emotionTags : profile.emotionTags).slice(0, 4)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7 }}
      className="relative flex min-h-full flex-col items-center justify-center overflow-hidden px-5 py-8"
    >
      {/* Archive room photograph */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: "url('/image/bg2.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            'linear-gradient(180deg, rgba(8,6,5,0.28) 0%, rgba(8,6,5,0.12) 42%, rgba(8,6,5,0.45) 100%)',
        }}
      />

      {/* Claim slip */}
      <motion.div
        initial={{ opacity: 0, y: 28, rotate: -3.5 }}
        animate={{ opacity: 1, y: 0, rotate: -1.5 }}
        transition={{ delay: 0.18, type: 'spring', stiffness: 120, damping: 16 }}
        className="relative z-10 w-full max-w-[292px]"
      >
        <div
          className="pointer-events-none absolute -bottom-3 left-4 right-4 h-8 rounded-[100%]"
          style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.5) 0%, transparent 70%)' }}
        />

        <div
          className="relative overflow-hidden"
          style={{
            background:
              'linear-gradient(155deg, #F3EADB 0%, #E8DCC6 38%, #DCCEB4 72%, #EFE3CF 100%)',
            boxShadow:
              '0 22px 48px rgba(0,0,0,0.52), 0 2px 0 rgba(255,255,255,0.25) inset, 0 -18px 36px rgba(90,60,30,0.08) inset',
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.28] mix-blend-multiply"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='0.45'/%3E%3C/svg%3E")`,
            }}
          />
          <div
            className="pointer-events-none absolute -left-6 top-10 h-28 w-28 rounded-full opacity-30"
            style={{ background: 'radial-gradient(circle, rgba(139,90,43,0.28) 0%, transparent 68%)' }}
          />

          <div className="pointer-events-none absolute inset-[10px] border border-[#3B2A22]/12" />
          <div className="pointer-events-none absolute inset-[13px] border border-[#3B2A22]/06" />

          <div className="relative px-7 pb-6 pt-8">
            <div className="text-center">
              <h3 className="font-serif text-[19px] font-semibold tracking-[0.28em] text-[#2A1F1A]">
                失物认领单
              </h3>
              <div className="mx-auto mt-4 flex w-[78%] items-center gap-2">
                <span className="h-px flex-1 bg-[#3B2A22]/22" />
                <span className="h-[3px] w-[3px] rotate-45 bg-[#C9A46A]/80" />
                <span className="h-px flex-1 bg-[#3B2A22]/22" />
              </div>
            </div>

            <div className="mt-7 space-y-5">
              <Field label="遗失物" emphasize>
                <span className="break-words">{lostItem}</span>
              </Field>
              <Field label="发现地点">{foundLocation}</Field>
              <Field label="保管位置">QQ音乐 · 归途电台</Field>
              <Field label="认领理由">
                <span className="whitespace-pre-line break-words">{claimReason}</span>
              </Field>

              {emotionTags.length > 0 && (
                <div className="relative pl-3">
                  <span className="absolute bottom-1 left-0 top-1 w-px bg-[#3B2A22]/18" />
                  <p className="mb-2 text-[10px] tracking-[0.22em] text-[#3B2A22]/45">情绪标签</p>
                  <div className="flex flex-wrap gap-1.5">
                    {emotionTags.map((tag) => (
                      <span
                        key={tag}
                        className="border border-[#C9A46A]/35 bg-[#C9A46A]/12 px-2.5 py-1 font-serif text-[11px] tracking-[0.14em] text-[#5C4632]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mx-auto mt-7 flex w-[78%] items-center gap-2">
              <span className="h-px flex-1 bg-[#3B2A22]/18" />
              <span className="h-[3px] w-[3px] rotate-45 bg-[#3B2A22]/25" />
              <span className="h-px flex-1 bg-[#3B2A22]/18" />
            </div>
            <p className="mt-4 text-center font-serif text-[10px] tracking-[0.28em] text-[#3B2A22]/40">
              LF-20260718-0582
            </p>
          </div>

          <motion.div
            initial={{ scale: 0.6, opacity: 0, rotate: -28 }}
            animate={{ scale: 1, opacity: 1, rotate: -14 }}
            transition={{ delay: 0.55, type: 'spring', stiffness: 160, damping: 12 }}
            className="pointer-events-none absolute right-5 top-9"
          >
            <div
              className="border-[2.5px] border-[#C41E3A]/75 px-2.5 py-1.5 font-serif text-[11px] font-bold tracking-[0.18em] text-[#C41E3A]/75"
              style={{
                boxShadow: '0 0 0 1px rgba(196,30,58,0.12) inset',
                transform: 'skewX(-4deg)',
              }}
            >
              FOUND
            </div>
          </motion.div>

          <div className="absolute -top-3 left-7 h-14 w-5">
            <div
              className="mx-auto h-full w-[7px] rounded-full"
              style={{
                background: 'linear-gradient(180deg, #E2C48A 0%, #C9A46A 45%, #8B7355 100%)',
                boxShadow: '1px 2px 4px rgba(0,0,0,0.28), inset 1px 0 1px rgba(255,255,255,0.35)',
              }}
            />
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.85 }}
        className="relative z-10 mt-9"
      >
        <button
          type="button"
          onClick={onNext}
          className="min-w-[168px] border border-[#E2C48A]/40 bg-[#C9A46A] px-9 py-3 font-serif text-sm tracking-[0.22em] text-[#1A1410] shadow-[0_10px_28px_rgba(201,164,106,0.28)] transition-all hover:bg-[#D4B37A] active:translate-y-px"
        >
          开始领取
        </button>
      </motion.div>
    </motion.div>
  )
}
