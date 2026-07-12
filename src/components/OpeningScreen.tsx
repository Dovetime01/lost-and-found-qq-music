// src/components/OpeningScreen.tsx
'use client'

import { motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect, useState } from 'react'
import StarrySeaBackground from '@/components/StarrySeaBackground'
import { playSound } from '@/lib/soundEffects'

interface OpeningScreenProps {
  onNext: () => void
}

export default function OpeningScreen({ onNext }: OpeningScreenProps) {
  const [dustParticles, setDustParticles] = useState<any[]>([])
  const [doorOpening, setDoorOpening] = useState(false)
  const [showContent, setShowContent] = useState(false)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  useEffect(() => {
    // 分层灰尘：近景大而亮、远景小而暗
    const particles = Array.from({ length: 100 }, (_, i) => {
      const depth = Math.random()
      return {
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        delay: Math.random() * 12,
        duration: 10 + Math.random() * 10,
        size: 0.4 + depth * 3,
        brightness: 0.15 + depth * 0.7,
        drift: (Math.random() - 0.5) * 40,
      }
    })
    setDustParticles(particles)

    // 门开后再显示内容
    const t1 = setTimeout(() => setDoorOpening(true), 600)
    const t2 = setTimeout(() => setShowContent(true), 2000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    mouseX.set(e.clientX - rect.left)
    mouseY.set(e.clientY - rect.top)
  }

  const handleEnter = () => {
    playSound('drawer')
    setTimeout(onNext, 500)
  }

  // 视差光晕跟随鼠标
  const glowX = useTransform(mouseX, [0, 400], [-20, 20])
  const glowY = useTransform(mouseY, [0, 800], [-15, 15])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 1.5 }}
      onMouseMove={handleMouseMove}
      className="relative h-full min-h-full overflow-hidden bg-[#06080e]"
    >
      <StarrySeaBackground />

      {/* Soft parallax glow follows cursor over the photo */}
      <motion.div
        className="pointer-events-none absolute z-[1]"
        style={{
          top: '5%',
          left: '50%',
          width: '700px',
          height: '500px',
          x: glowX,
          y: glowY,
          translateX: '-50%',
        }}
      >
        <motion.div
          animate={{
            opacity: [0.25, 0.4, 0.28, 0.42, 0.3],
            scale: [1, 1.02, 0.99, 1.03, 1],
          }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          className="h-full w-full"
          style={{
            background:
              'radial-gradient(ellipse at 50% 30%, rgba(255, 198, 119, 0.22) 0%, rgba(201, 164, 106, 0.1) 30%, transparent 70%)',
            filter: 'blur(20px)',
          }}
        />
      </motion.div>

      {/* Dust motes */}
      {dustParticles.map(p => (
        <motion.div
          key={p.id}
          className="pointer-events-none absolute z-[1] rounded-full"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            background: `rgba(255, 220, 180, ${p.brightness})`,
            boxShadow: `0 0 ${p.size * 2}px rgba(255, 220, 180, ${p.brightness * 0.5})`,
          }}
          animate={{
            y: [0, -200, 0],
            x: [0, p.drift, 0],
            opacity: [0, p.brightness, p.brightness, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}

      {/* Door frame reveal */}
      <motion.div
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: doorOpening ? 1 : 0.3, opacity: doorOpening ? 1 : 0 }}
        transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center"
      >
        <div
          className="h-[85%] w-[90%] max-w-md rounded-t-[200px] border-[3px] opacity-20"
          style={{
            borderColor: 'rgba(201, 164, 106, 0.3)',
            boxShadow: '0 0 60px rgba(201, 164, 106, 0.15), inset 0 0 40px rgba(0,0,0,0.5)',
          }}
        />
      </motion.div>

      {/* === 主要内容：锁定手机屏高，整体略偏下居中 === */}
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: showContent ? 0 : 30, opacity: showContent ? 1 : 0 }}
        transition={{ delay: 0.3, duration: 1.5 }}
        className="relative z-20 flex h-full min-h-full flex-col items-center justify-center px-6 pb-10 pt-16"
      >
        {/* 悬挂营业牌（放进内容流，避免顶死上沿） */}
        <motion.div
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: showContent ? 0 : -24, opacity: showContent ? 1 : 0 }}
          transition={{ duration: 1, type: 'spring' }}
          className="mb-8"
        >
          <motion.div
            animate={{ rotate: [-2, 2, -2] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            className="relative"
          >
            <div className="mx-auto h-8 w-px bg-archive-gold/40" />
            <div
              className="-mt-1 px-4 py-2"
              style={{
                background: 'linear-gradient(135deg, #2a1f1a, #1a1410)',
                border: '1px solid rgba(201, 164, 106, 0.3)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >
              <p className="font-serif text-[10px] tracking-[0.3em] text-archive-gold/70">
                OPEN · 营业中
              </p>
            </div>
          </motion.div>
        </motion.div>

        {/* 主标题 */}
        <div className="relative text-center">
          <motion.h1
            initial={{ letterSpacing: '0.5em', opacity: 0 }}
            animate={{ letterSpacing: '0.15em', opacity: 1 }}
            transition={{ delay: 0.8, duration: 1.8 }}
            className="mb-3 font-serif text-4xl font-bold text-archive-paper"
            style={{
              textShadow: '0 0 30px rgba(201, 164, 106, 0.4), 0 4px 8px rgba(0,0,0,0.6)',
            }}
          >
            失物招领处
          </motion.h1>

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 1.5, duration: 1 }}
            className="my-3 flex items-center justify-center gap-3"
          >
            <div className="h-px w-12 bg-archive-gold/40" />
            <div className="h-1.5 w-1.5 rounded-full bg-archive-gold/60" />
            <div className="h-px w-12 bg-archive-gold/40" />
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.8, duration: 1 }}
            className="mb-10 text-xs font-light tracking-[0.4em] text-archive-gold/80"
          >
            LOST · & · FOUND
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: showContent ? 1 : 0 }}
          transition={{ delay: 2.2, duration: 1.5 }}
          className="mb-12 max-w-xs space-y-2 text-center"
        >
          <p className="font-serif text-sm italic leading-loose text-archive-paper/60">
            每一场演出之后,
          </p>
          <p className="font-serif text-sm italic leading-loose text-archive-paper/60">
            总有一些东西被遗落在那里。
          </p>
          <div className="h-3" />
          <p className="font-serif text-sm leading-loose text-archive-gold/90">
            我们帮你 在音乐里 找回来。
          </p>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: showContent ? 1 : 0, y: 0 }}
          transition={{ delay: 2.8, duration: 0.8 }}
          whileHover={{ scale: 1.03, y: -2 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleEnter}
          onMouseEnter={() => playSound('page')}
          className="group relative"
        >
          <div
            className="relative overflow-hidden px-12 py-4"
            style={{
              background: 'linear-gradient(135deg, rgba(43, 30, 22, 0.6), rgba(26, 20, 16, 0.8))',
              border: '1.5px solid rgba(201, 164, 106, 0.5)',
              boxShadow: `
                0 0 40px rgba(201, 164, 106, 0.2),
                inset 0 0 20px rgba(201, 164, 106, 0.08),
                0 8px 24px rgba(0, 0, 0, 0.6)
              `,
            }}
          >
            <motion.div
              className="absolute inset-0 opacity-40"
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 3, repeat: Infinity }}
              style={{
                background: 'radial-gradient(ellipse at center, rgba(201, 164, 106, 0.3) 0%, transparent 70%)',
              }}
            />
            <span className="relative font-serif text-base tracking-[0.3em] text-archive-gold">
              推 门 进 入
            </span>
            <div className="absolute left-1 top-1 h-2 w-2 border-l border-t border-archive-gold/60" />
            <div className="absolute right-1 top-1 h-2 w-2 border-r border-t border-archive-gold/60" />
            <div className="absolute bottom-1 left-1 h-2 w-2 border-b border-l border-archive-gold/60" />
            <div className="absolute bottom-1 right-1 h-2 w-2 border-b border-r border-archive-gold/60" />
          </div>
        </motion.button>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: showContent ? 0.4 : 0 }}
          transition={{ delay: 3.5, duration: 1 }}
          className="mt-10 text-center"
        >
          <p className="font-serif text-[10px] tracking-[0.3em] text-archive-paper/40">
            OPEN AFTER EVERY SHOW · 演出散场后开放
          </p>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
