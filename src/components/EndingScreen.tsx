'use client'

import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import type { MemoryProfile } from '@/lib/analysis'
import type { ArchiveItem } from '@/lib/archive'

const finalParticles = Array.from({ length: 20 }, (_, index) => ({
  delay: (index % 8) * 0.25,
  duration: 3 + (index % 5) * 0.35,
  left: (index * 41) % 100,
  top: (index * 67) % 100,
}))

interface EndingScreenProps {
  archiveItem: ArchiveItem | null
  profile: MemoryProfile
}

export default function EndingScreen({ archiveItem, profile }: EndingScreenProps) {
  const [drawerClosing, setDrawerClosing] = useState(false)
  const [showFinalText, setShowFinalText] = useState(false)
  const [showLogo, setShowLogo] = useState(false)
  const title = archiveItem?.title ?? profile.lostItem
  const songTitle = archiveItem?.songTitle ?? profile.primarySong.title

  useEffect(() => {
    const closingTimer = setTimeout(() => setDrawerClosing(true), 1000)
    const textTimer = setTimeout(() => setShowFinalText(true), 2500)
    const logoTimer = setTimeout(() => setShowLogo(true), 4500)

    return () => {
      clearTimeout(closingTimer)
      clearTimeout(textTimer)
      clearTimeout(logoTimer)
    }
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="min-h-full bg-archive-bg flex flex-col items-center justify-center px-6 relative overflow-hidden"
    >
      {/* Ambient glow */}
      <div className="absolute inset-0">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-10"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(201, 164, 106, 0.4) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Drawer */}
      <motion.div
        initial={{ y: 0 }}
        animate={{ y: drawerClosing ? 0 : 0 }}
        className="relative z-10 mb-12"
      >
        {/* Cabinet frame */}
        <div className="relative">
          {/* Drawer front */}
          <motion.div
            initial={{ y: -20 }}
            animate={{ y: drawerClosing ? 0 : -20 }}
            transition={{ duration: 1.5, ease: 'easeInOut' }}
            className="bg-archive-wood/40 border-4 border-archive-wood/60 p-6 w-72"
            style={{
              borderRadius: '4px',
            }}
          >
            {/* Brass handle */}
            <div className="absolute top-1/2 -translate-y-1/2 right-4 w-12 h-2 bg-archive-gold/60 rounded-full" />
            
            {/* Label */}
            <div className="bg-archive-paper/90 p-4 rounded shadow-lg">
              <p className="text-archive-wood/50 text-xs text-center mb-2">失物编号 #0525</p>
              <div className="space-y-2">
                <div>
                  <p className="text-archive-wood/50 text-xs">遗失物：</p>
                  <p className="text-archive-wood text-sm font-serif">{title}</p>
                </div>
                <div>
                  <p className="text-archive-wood/50 text-xs">保管歌曲：</p>
                  <p className="text-archive-gold text-sm font-serif">《{songTitle}》</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Drawer shadow */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: drawerClosing ? 0.3 : 0 }}
            className="absolute -bottom-4 left-4 right-4 h-4 bg-black/30 blur-sm"
          />
        </div>
      </motion.div>

      {/* Final text */}
      {showFinalText && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="text-center max-w-sm z-10"
        >
          <p className="text-archive-paper/80 text-base leading-relaxed mb-4">
            以后当你再次播放《{songTitle}》时，
          </p>
          <p className="text-archive-gold text-base leading-relaxed">
            这里会重新亮起。
          </p>

          {/* Glowing music note */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1, type: 'spring' }}
            className="mt-8 flex justify-center"
          >
            <motion.div
              animate={{
                opacity: [0.5, 1, 0.5],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="text-4xl"
              style={{
                filter: 'drop-shadow(0 0 20px rgba(201, 164, 106, 0.6))',
              }}
            >
              🎵
            </motion.div>
          </motion.div>
        </motion.div>
      )}

      {/* QQ Music logo */}
      {showLogo && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2"
        >
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center">
              <span className="text-white text-lg font-bold">♪</span>
            </div>
            <div>
              <p className="text-archive-paper/60 text-xs">QQ音乐</p>
              <p className="text-archive-paper/40 text-xs">QQ MUSIC</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-archive-gold/30 rounded-full"
            style={{
              left: `${finalParticles[i].left}%`,
              top: `${finalParticles[i].top}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.3, 0.8, 0.3],
            }}
            transition={{
              duration: finalParticles[i].duration,
              repeat: Infinity,
              delay: finalParticles[i].delay,
            }}
          />
        ))}
      </div>
    </motion.div>
  )
}
