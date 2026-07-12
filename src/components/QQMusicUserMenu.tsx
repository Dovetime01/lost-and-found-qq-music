'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { QQMusicUserSession } from '@/lib/qqMusicAuthTypes'

interface QQMusicUserMenuProps {
  session: QQMusicUserSession
  onLogout: () => void
}

export default function QQMusicUserMenu({
  session,
  onLogout,
}: QQMusicUserMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="打开 QQ音乐用户菜单"
        aria-expanded={open}
        className="flex h-9 max-w-[138px] items-center gap-2 rounded-full border border-[#C9A46A]/25 bg-[#0d0d0d]/80 p-1 pr-3 shadow-lg backdrop-blur-md transition hover:border-[#C9A46A]/55"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-[#C9A46A]/20 text-[11px] text-[#E9DFC8]">
          {session.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            session.nickname.slice(0, 1)
          )}
        </span>
        <span className="truncate text-[10px] tracking-[0.04em] text-[#E9DFC8]/85">
          {session.nickname}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-11 w-[220px] overflow-hidden border border-[#C9A46A]/25 bg-[#171411]/95 shadow-[0_18px_55px_rgba(0,0,0,.6)] backdrop-blur-xl"
          >
            <div className="p-4">
              <p className="truncate text-sm text-[#E9DFC8]">{session.nickname}</p>
              <div className="mt-2 inline-flex items-center gap-1.5 border border-[#C9A46A]/25 px-2 py-1 text-[10px] text-[#C9A46A]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#C9A46A]" />
                {session.accessLabel}
              </div>
              <p className="mt-3 text-[10px] leading-4 text-[#E9DFC8]/40">
                播放权益以 QQ音乐对当前歌曲的实时返回为准。
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onLogout()
              }}
              className="w-full border-t border-[#E9DFC8]/10 px-4 py-3 text-left text-[11px] tracking-[0.08em] text-[#E9DFC8]/60 transition hover:bg-white/5 hover:text-[#E9DFC8]"
            >
              退出登录
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
