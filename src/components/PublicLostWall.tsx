'use client'

import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import type { ArchiveItem } from '@/lib/archive'
import {
  createWallNoteFromArchive,
  getDemoPublicWallNotes,
  type PublicWallNote,
  type PublicWallProviderStatus,
} from '@/lib/publicWall'

interface PublicLostWallProps {
  archiveItem: ArchiveItem | null
  onNext: () => void
}

interface PublicWallApiListResponse {
  notes: PublicWallNote[]
  provider: PublicWallProviderStatus
}

interface PublicWallApiPublishResponse {
  note: PublicWallNote
  provider: PublicWallProviderStatus
}

export default function PublicLostWall({ archiveItem, onNext }: PublicLostWallProps) {
  const [wallNotes, setWallNotes] = useState<PublicWallNote[]>(() => getDemoPublicWallNotes())
  const [, setProvider] = useState<PublicWallProviderStatus>({
    connected: false,
    label: '本地示例留言墙',
    description: '当前未配置 Supabase，使用本地示例留言；配置后可真实发布。',
  })
  const [composerOpen, setComposerOpen] = useState(false)
  const [draftContent, setDraftContent] = useState('')
  const [draftCity, setDraftCity] = useState('匿名归途')
  const [publishHint, setPublishHint] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadAndPublish() {
      let notes = getDemoPublicWallNotes()
      try {
        const listResponse = await fetch('/api/public-wall')
        if (listResponse.ok) {
          const result = await listResponse.json() as PublicWallApiListResponse
          notes = result.notes
          if (isMounted) setProvider(result.provider)
        }
      } catch {
        notes = getDemoPublicWallNotes()
      }

      if (archiveItem) {
        const currentNote = createWallNoteFromArchive(archiveItem)
        try {
          const publishResponse = await fetch('/api/public-wall', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: currentNote }),
          })

          if (publishResponse.ok) {
            const result = await publishResponse.json() as PublicWallApiPublishResponse
            notes = [{ ...result.note, isCurrent: true }, ...notes.filter((note) => note.id !== result.note.id)]
            if (isMounted) setProvider(result.provider)
          } else {
            notes = [currentNote, ...notes]
          }
        } catch {
          notes = [currentNote, ...notes]
        }
      }

      if (isMounted) setWallNotes(notes)
    }

    loadAndPublish()

    return () => {
      isMounted = false
    }
  }, [archiveItem])

  const lostNotes = useMemo(
    () => wallNotes.filter((note, index, list) => list.findIndex((item) => item.id === note.id) === index),
    [wallNotes]
  )

  const openComposer = () => {
    const defaultNote = archiveItem ? createWallNoteFromArchive(archiveItem) : null
    setDraftContent(defaultNote?.content ?? '')
    setDraftCity(defaultNote?.city ?? '匿名归途')
    setPublishHint('')
    setComposerOpen(true)
  }

  const publishDraft = async () => {
    const content = draftContent.trim()
    if (!content) {
      setPublishHint('先写一句想留下的话')
      return
    }

    const note: PublicWallNote = {
      id: archiveItem?.id ? `${archiveItem.id}-manual` : `local-${Date.now()}`,
      userId: archiveItem?.userId ?? 'local-anonymous',
      content: content.slice(0, 120),
      city: draftCity.trim() || '匿名归途',
      date: new Date().toISOString().slice(0, 10).replaceAll('-', '.'),
      likes: 1,
      isCurrent: true,
    }

    try {
      const publishResponse = await fetch('/api/public-wall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })

      if (publishResponse.ok) {
        const result = await publishResponse.json() as PublicWallApiPublishResponse
        setWallNotes((notes) => [
          { ...result.note, isCurrent: true },
          ...notes.filter((item) => item.id !== result.note.id),
        ])
        setProvider(result.provider)
      } else {
        setWallNotes((notes) => [note, ...notes.filter((item) => item.id !== note.id)])
      }
    } catch {
      setWallNotes((notes) => [note, ...notes.filter((item) => item.id !== note.id)])
    }

    setComposerOpen(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="min-h-full bg-archive-bg px-6 py-6"
    >
      {/* Title */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-center mb-8"
      >
        <h2 className="text-archive-paper text-2xl font-serif mb-2">
          失物墙
        </h2>
        <p className="text-archive-paper/60 text-sm">
          匿名分享你的音乐记忆
        </p>
      </motion.div>

      {/* Cork board background */}
      <div className="relative max-w-md mx-auto">
        {/* Board frame */}
        <div
          className="rounded-xl border border-archive-wood/40 p-3.5"
          style={{
            background: 'linear-gradient(160deg, rgba(59,42,34,0.55) 0%, rgba(42,31,26,0.72) 100%)',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.35), 0 12px 32px rgba(0,0,0,0.25)',
          }}
        >
          {/* Masonry grid */}
          <div className="columns-2 gap-3">
            {lostNotes.map((note, index) => {
              const tilt = index % 2 === 0 ? -1.8 : 1.6
              return (
              <motion.div
                key={note.id}
                initial={{ y: 20, opacity: 0, rotate: tilt }}
                animate={{ y: 0, opacity: 1, rotate: tilt }}
                transition={{ delay: 0.08 * index }}
                whileHover={{ scale: 1.03, rotate: 0, zIndex: 10 }}
                className="mb-3 break-inside-avoid"
              >
                <div
                  className={`paper-texture relative overflow-hidden px-3.5 pb-3 pt-5 ${
                    note.isCurrent ? 'ring-1 ring-archive-gold/35' : ''
                  }`}
                  style={{
                    borderRadius: '2px 3px 2px 4px',
                    background: note.isCurrent
                      ? 'linear-gradient(155deg, #f6eeda 0%, #ebe0c8 55%, #dfd2b8 100%)'
                      : 'linear-gradient(155deg, #f0e6d2 0%, #e5d9c0 55%, #d9ccb2 100%)',
                    boxShadow: '0 10px 22px rgba(0,0,0,0.32), 0 2px 0 rgba(255,255,255,0.25) inset',
                  }}
                >
                  {/* 和纸胶带 */}
                  <div
                    className="absolute -top-1 left-1/2 h-3.5 w-11 -translate-x-1/2 opacity-80"
                    style={{
                      background: 'linear-gradient(180deg, rgba(201,164,106,0.5), rgba(201,164,106,0.28))',
                      transform: `translateX(-50%) rotate(${tilt * 0.6}deg)`,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
                    }}
                  />

                  {/* 折角 */}
                  <div
                    className="pointer-events-none absolute bottom-0 right-0 h-4 w-4"
                    style={{
                      background: 'linear-gradient(135deg, transparent 48%, rgba(59,42,34,0.14) 48%, rgba(59,42,34,0.22) 100%)',
                    }}
                  />

                  <p className="relative mb-2.5 font-serif text-[12.5px] leading-[1.7] text-archive-wood">
                    <span className="mr-0.5 text-archive-gold/55">"</span>
                    {note.content}
                    <span className="ml-0.5 text-archive-gold/55">"</span>
                  </p>

                  {note.isCurrent && (
                    <div
                      className="mb-2.5 inline-flex items-center gap-1 rounded-sm border border-archive-gold/35 px-2 py-0.5"
                      style={{ background: 'rgba(201,164,106,0.1)' }}
                    >
                      <span className="h-1 w-1 rounded-full bg-archive-gold/70" />
                      <span className="font-serif text-[9px] tracking-[0.16em] text-archive-gold">
                        刚刚留下
                      </span>
                    </div>
                  )}

                  <div className="relative border-t border-archive-wood/12 pt-2">
                    <div className="flex items-center justify-between text-[10px] text-archive-wood/50">
                      <span className="tracking-wide">{note.city}</span>
                      <span className="tabular-nums">{note.date}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-archive-wood/45">
                      <span className="text-archive-gold/70">♥</span>
                      <span>{note.likes}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )})}
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute -top-4 -right-4 w-8 h-8 bg-archive-gold/40 rounded-full opacity-50" />
        <div className="absolute -bottom-4 -left-4 w-6 h-6 bg-archive-gold/40 rounded-full opacity-50" />
      </div>

      {/* Add note button */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="max-w-sm mx-auto mt-8 relative z-10"
      >
        <button
          onClick={openComposer}
          className="w-full py-4 border-2 border-archive-gold/50 text-archive-gold font-serif tracking-wider rounded hover:bg-archive-gold/10 transition-all mb-4"
        >
          + 留下你的失物
        </button>
        
        <button
          onClick={onNext}
          className="w-full py-4 bg-archive-gold text-archive-bg font-serif tracking-wider rounded hover:bg-archive-accent transition-all"
        >
          完成 →
        </button>
      </motion.div>

      {composerOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-5">
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-sm bg-archive-paper paper-texture p-5 shadow-2xl"
            style={{ borderRadius: 4 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-archive-wood font-serif text-lg">留下你的失物</h3>
              <button
                onClick={() => setComposerOpen(false)}
                className="text-archive-wood/50 text-xl"
              >
                ×
              </button>
            </div>

            <label className="block text-archive-wood/60 text-xs mb-2">想贴在墙上的话</label>
            <textarea
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value.slice(0, 120))}
              placeholder="比如：我把那晚的风留在了返程路上。"
              className="w-full min-h-32 resize-none rounded border border-archive-wood/20 bg-white/35 p-3 text-archive-wood text-sm leading-relaxed outline-none placeholder:text-archive-wood/35"
            />
            <div className="mt-2 flex items-center justify-between">
              <input
                value={draftCity}
                onChange={(event) => setDraftCity(event.target.value.slice(0, 12))}
                placeholder="城市"
                className="w-28 rounded border border-archive-wood/20 bg-white/35 px-3 py-2 text-archive-wood text-xs outline-none placeholder:text-archive-wood/35"
              />
              <span className="text-[10px] text-archive-wood/45">{draftContent.length}/120</span>
            </div>

            {publishHint && (
              <p className="mt-3 text-xs text-archive-gold">{publishHint}</p>
            )}

            <button
              onClick={publishDraft}
              className="mt-5 w-full py-3 bg-archive-gold text-archive-bg font-serif tracking-wider rounded hover:bg-archive-accent transition-all"
            >
              贴到失物墙
            </button>
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}
