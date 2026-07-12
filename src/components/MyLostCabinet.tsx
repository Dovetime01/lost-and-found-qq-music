// src/components/MyLostCabinet.tsx
'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import type { ChangeEvent } from 'react'
import { playSound } from '@/lib/soundEffects'
import type { ArchiveItem } from '@/lib/archive'
import {
  loadCabinetPersonalization,
  saveCabinetPersonalization,
  type CabinetPersonalization,
} from '@/lib/cabinetPersonalization'
import { imageFileToStorageDataUrl } from '@/lib/imageCompression'

interface MyLostCabinetProps {
  archiveItem: ArchiveItem | null
  onNext: () => void
}

interface LostItem {
  id: string
  title: string
  song: string
  artist: string
  date: string
  note: string
  emotionTags: string[]
  photoDataUrls: string[]
  isCurrent?: boolean
}

const tagOptions = [
  '温柔',
  '不舍',
  '遗憾',
  '热烈',
  '释放',
  '青春',
  '回忆',
  '治愈',
  '后劲很大',
  '想再听一遍',
]

function isDisplayablePhotoUrl(photo: string) {
  return /^data:image\/(png|jpe?g|webp|gif);/i.test(photo)
}

export default function MyLostCabinet({ archiveItem, onNext }: MyLostCabinetProps) {
  const [selectedDrawer, setSelectedDrawer] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [dustParticles, setDustParticles] = useState<any[]>([])
  const [personalization, setPersonalization] = useState<CabinetPersonalization>({
    note: '',
    photoDataUrls: [],
    emotionTags: [],
  })
  const [saveHint, setSaveHint] = useState('')
  const [customTag, setCustomTag] = useState('')

  useEffect(() => {
    const particles = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 4,
      duration: 5 + Math.random() * 3,
      size: 1 + Math.random() * 2,
    }))
    setDustParticles(particles)
  }, [])

  const demoLostItems: LostItem[] = [
    {
      id: '001',
      title: '那个敢把心事唱出来的自己',
      song: '《晴天》',
      artist: '周杰伦',
      date: '2024.03.15',
      note: '他只是暂时住进了这首歌里。',
      emotionTags: ['青春', '回忆'],
      photoDataUrls: [],
    },
    {
      id: '002',
      title: '在副歌里流泪的勇气',
      song: '《红玫瑰》',
      artist: '陈奕迅',
      date: '2024.02.28',
      note: '有些情绪不用解释，唱完就被接住了。',
      emotionTags: ['遗憾', '不舍'],
      photoDataUrls: [],
    },
    {
      id: '003',
      title: '相信爱情的那个夜晚',
      song: '《慢慢喜欢你》',
      artist: '莫文蔚',
      date: '2023.12.31',
      note: '那一晚被时间收好，后来每次听见都还会亮。',
      emotionTags: ['温柔', '释然'],
      photoDataUrls: [],
    },
  ]
  const currentLostItem: LostItem | null = archiveItem
    ? {
        id: archiveItem.id,
        title: archiveItem.title,
        song: `《${archiveItem.songTitle}》`,
        artist: archiveItem.artist,
        date: archiveItem.date,
        note: archiveItem.note,
        emotionTags: archiveItem.emotionTags,
        photoDataUrls: archiveItem.photoDataUrls,
        isCurrent: true,
      }
    : null
  const lostItems: LostItem[] = currentLostItem
    ? [currentLostItem, ...demoLostItems]
    : demoLostItems

  const selectedItem = lostItems.find(item => item.id === selectedDrawer)

  useEffect(() => {
    if (!selectedItem?.isCurrent) {
      setPersonalization({ note: '', photoDataUrls: [], emotionTags: [] })
      setSaveHint('')
      setCustomTag('')
      return
    }

    const saved = loadCabinetPersonalization(selectedItem.id)
    setPersonalization({
      ...saved,
      emotionTags: saved.emotionTags.length > 0 ? saved.emotionTags : selectedItem.emotionTags.slice(0, 5),
    })
    setSaveHint('')
    setCustomTag('')
  }, [selectedItem?.id, selectedItem?.isCurrent])

  const handleDrawerClick = (id: string) => {
    playSound('drawer')
    setSelectedDrawer(id)
    setTimeout(() => setDrawerOpen(true), 300)
  }

  const handleClose = () => {
    playSound('drawer')
    setDrawerOpen(false)
    setTimeout(() => setSelectedDrawer(null), 300)
  }

  const handlePhotoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0 || !selectedItem?.isCurrent) return

    Promise.all(files.map((file) => imageFileToStorageDataUrl(file))).then((photoDataUrls) => {
      const validPhotoDataUrls = photoDataUrls.filter(isDisplayablePhotoUrl)
      if (validPhotoDataUrls.length === 0) {
        setSaveHint('这张图片格式暂不支持预览，请换 JPG 或 PNG')
        return
      }

      const next = {
        ...personalization,
        photoDataUrls: Array.from(new Set([...displayPhotos, ...validPhotoDataUrls])).slice(0, 9),
      }
      const saved = saveCabinetPersonalization(selectedItem.id, next)
      setPersonalization(saved)
      setSaveHint(
        saved.photoDataUrls.length < next.photoDataUrls.length
          ? '照片较大，已保留可保存的部分'
          : validPhotoDataUrls.length < photoDataUrls.length
            ? '部分图片格式暂不支持预览'
            : validPhotoDataUrls.length > 1 ? '已追加照片册' : '已追加照片'
      )
    })

    event.target.value = ''
  }

  const removePhoto = (photoIndex: number) => {
    if (!selectedItem?.isCurrent) return

    const nextPhotos = displayPhotos.filter((_, index) => index !== photoIndex)
    const next = {
      ...personalization,
      photoDataUrls: nextPhotos,
    }
    const saved = saveCabinetPersonalization(selectedItem.id, next)
    setPersonalization(saved)
    setSaveHint('已移除照片')
  }

  const handleNoteChange = (value: string) => {
    if (!selectedItem?.isCurrent) return

    const next = {
      ...personalization,
      note: value.slice(0, 160),
    }
    const saved = saveCabinetPersonalization(selectedItem.id, next)
    setPersonalization(saved)
    setSaveHint('已保存备注')
  }

  const toggleEmotionTag = (tag: string) => {
    if (!selectedItem?.isCurrent) return

    const exists = personalization.emotionTags.includes(tag)
    const nextTags = exists
      ? personalization.emotionTags.filter((item) => item !== tag)
      : [...personalization.emotionTags, tag].slice(0, 5)
    const next = { ...personalization, emotionTags: nextTags }

    const saved = saveCabinetPersonalization(selectedItem.id, next)
    setPersonalization(saved)
    setSaveHint('已保存标签')
  }

  const addCustomEmotionTag = (tag: string) => {
    const trimmed = tag.trim().slice(0, 8)
    if (!trimmed || personalization.emotionTags.includes(trimmed)) return
    if (!selectedItem?.isCurrent) return

    const next = {
      ...personalization,
      emotionTags: [...personalization.emotionTags.filter((item) => item !== trimmed).slice(0, 4), trimmed],
    }
    const saved = saveCabinetPersonalization(selectedItem.id, next)
    setPersonalization(saved)
    setSaveHint('已添加标签')
    setCustomTag('')
  }

  const displayPhotos = (selectedItem?.isCurrent
    ? (personalization.photoDataUrls.length > 0 ? personalization.photoDataUrls : selectedItem.photoDataUrls)
    : selectedItem?.photoDataUrls ?? []
  ).filter((photo) => typeof photo === 'string' && isDisplayablePhotoUrl(photo))
  const displayTags = selectedItem?.isCurrent
    ? personalization.emotionTags
    : selectedItem?.emotionTags ?? []
  const suggestedTags = Array.from(new Set([
    ...displayTags,
    ...(selectedItem?.emotionTags ?? []),
    ...tagOptions,
  ])).slice(0, 12)

  return (
    <div
      className="min-h-full relative overflow-hidden px-4 py-6"
      style={{
        background: 'radial-gradient(ellipse at 70% 20%, #1a1410 0%, #0D0D0D 60%)',
      }}
    >
      {/* === 胶片颗粒 === */}
      <div
        className="absolute inset-0 pointer-events-none z-50 opacity-[0.08]"
        style={{
          background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='5'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* === 灰尘粒子 === */}
      {dustParticles.map((p: any) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${p.left}%`,
            top: `${Math.random() * 100}%`,
            width: p.size,
            height: p.size,
            background: `rgba(233, 223, 200, ${0.2 + Math.random() * 0.4})`,
          }}
          animate={{
            y: [0, -150, 0],
            x: [0, (Math.random() - 0.5) * 30, 0],
            opacity: [0, 0.6, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}

      {/* === 台灯光 === */}
      <motion.div
        animate={{ opacity: [0.12, 0.16, 0.12] }}
        transition={{ duration: 4, repeat: Infinity }}
        className="absolute top-0 right-0 w-full h-1/2 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 90% 10%, rgba(201, 164, 106, 0.18) 0%, transparent 60%)',
        }}
      />

      {/* === 标题 === */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative z-10 text-center mb-8"
      >
        <div className="inline-block px-3 py-1 mb-3 border border-archive-gold/40" style={{ transform: 'rotate(-2deg)' }}>
          <span className="text-[10px] tracking-[0.3em] text-archive-gold/70 font-serif">MY CABINET</span>
        </div>
        <h1 className="text-xl font-serif text-archive-paper tracking-wide mb-2">我的失物柜</h1>
        <p className="text-archive-paper/50 text-xs">点击抽屉查看收藏</p>
      </motion.div>

      {/* === 失物柜墙 === */}
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="relative z-10 max-w-md mx-auto mb-8"
      >
        {/* 柜体 */}
        <div
          className="relative overflow-hidden rounded-xl p-3.5 sm:p-4"
          style={{
            background: 'linear-gradient(145deg, rgba(59,42,34,0.92) 0%, rgba(42,31,26,0.96) 48%, rgba(31,23,19,0.98) 100%)',
            boxShadow: '0 24px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.35)',
            border: '1px solid rgba(201,164,106,0.14)',
          }}
        >
          {/* 木质纹理 */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.22]"
            style={{
              background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.02' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            }}
          />
          <div
            className="pointer-events-none absolute inset-2 rounded-lg border border-archive-gold/10"
            aria-hidden
          />

          {/* 抽屉网格 */}
          <div className="relative grid grid-cols-2 gap-3">
            {/* 有物品的抽屉 */}
            {lostItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index }}
                className="relative"
              >
                <motion.button
                  animate={{
                    y: selectedDrawer === item.id && drawerOpen ? -30 : 0,
                  }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  onClick={() => handleDrawerClick(item.id)}
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.98 }}
                  className="relative w-full"
                  style={{ aspectRatio: '1.28/1' }}
                >
                  <div
                    className={`absolute inset-0 overflow-hidden rounded-lg ${
                      item.isCurrent ? 'ring-1 ring-archive-gold/45' : ''
                    }`}
                    style={{
                      background: 'linear-gradient(168deg, #3f3028 0%, #2c211c 42%, #1c1512 100%)',
                      boxShadow: item.isCurrent
                        ? 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -3px 10px rgba(0,0,0,0.5), 0 8px 20px rgba(0,0,0,0.35), 0 0 24px rgba(201,164,106,0.12)'
                        : 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -3px 10px rgba(0,0,0,0.45), 0 6px 14px rgba(0,0,0,0.28)',
                    }}
                  >
                    <div
                      className="pointer-events-none absolute inset-[5px] rounded-md border border-archive-gold/12"
                      aria-hidden
                    />

                    {/* 内凹标签槽 */}
                    <div
                      className="absolute inset-x-2.5 top-2.5 bottom-9 overflow-hidden rounded-md px-2.5 py-2"
                      style={{
                        background: 'linear-gradient(180deg, #f7f0e4 0%, #efe6d6 100%)',
                        boxShadow: 'inset 0 2px 5px rgba(59,42,34,0.14), inset 0 -1px 0 rgba(255,255,255,0.6)',
                      }}
                    >
                      <p className="relative text-[9px] tracking-[0.14em] text-archive-wood/45">
                        {item.isCurrent ? '本次归档' : `失物 #${item.id}`}
                      </p>
                      <p className="relative mt-1 line-clamp-2 font-serif text-[11px] leading-snug text-archive-wood">
                        {item.title}
                      </p>
                      {item.isCurrent && (
                        <span
                          className="relative mt-1.5 inline-block rounded-sm px-1.5 py-0.5 text-[8px] tracking-[0.12em] text-archive-gold"
                          style={{ background: 'rgba(201,164,106,0.14)' }}
                        >
                          刚刚收进
                        </span>
                      )}
                    </div>

                    {/* 黄铜拉手 */}
                    <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-1">
                      <div
                        className="h-[3px] w-3 rounded-full"
                        style={{
                          background: 'linear-gradient(180deg, #f0d49a 0%, #b8924f 55%, #7a5c2e 100%)',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.45)',
                        }}
                      />
                      <div
                        className="h-2 w-7 rounded-full"
                        style={{
                          background: 'linear-gradient(180deg, #e8c88a 0%, #a67c3d 50%, #6b4f24 100%)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 2px 4px rgba(0,0,0,0.4)',
                        }}
                      />
                      <div
                        className="h-[3px] w-3 rounded-full"
                        style={{
                          background: 'linear-gradient(180deg, #f0d49a 0%, #b8924f 55%, #7a5c2e 100%)',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.45)',
                        }}
                      />
                    </div>
                  </div>
                </motion.button>
              </motion.div>
            ))}

            {/* 空抽屉 */}
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="relative"
                style={{ aspectRatio: '1.28/1' }}
              >
                <div
                  className="absolute inset-0 overflow-hidden rounded-lg"
                  style={{
                    background: 'linear-gradient(180deg, #261e1a 0%, #1a1410 100%)',
                    boxShadow: 'inset 0 4px 14px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-[5px] rounded-md border border-archive-paper/8"
                    aria-hidden
                  />
                  <div className="absolute inset-x-3 top-3 bottom-9 flex items-center justify-center rounded-md border border-dashed border-archive-paper/14 bg-black/10">
                    <span className="font-serif text-[10px] tracking-[0.22em] text-archive-paper/28">空抽屉</span>
                  </div>
                  <div className="absolute bottom-2.5 left-1/2 h-1.5 w-8 -translate-x-1/2 rounded-full bg-archive-gold/18" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* === 继续按钮 === */}
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        onClick={onNext}
        whileHover={{ y: -2, scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className="relative z-10 w-full max-w-sm mx-auto block py-4 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #C9A46A 0%, #E9D4A0 100%)',
          boxShadow: '0 6px 20px rgba(201, 164, 106, 0.4)',
        }}
      >
        <motion.div
          className="absolute inset-0 opacity-30"
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{
            background: 'radial-gradient(circle at center, rgba(255,255,255,0.4) 0%, transparent 70%)',
          }}
        />
        <span className="relative text-archive-bg font-serif text-sm tracking-[0.3em]">
          查看失物墙
        </span>
      </motion.button>

      {/* === 抽屉详情浮层 === */}
      <AnimatePresence>
        {selectedItem && drawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={handleClose}
          >
            <motion.div
              initial={{ scale: 0.9, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 50 }}
              onClick={(e) => e.stopPropagation()}
              className="relative flex max-h-[78vh] w-full max-w-sm flex-col overflow-hidden rounded-xl"
              style={{
                background: 'linear-gradient(180deg, #FAF6EE 0%, #F3EBDD 100%)',
                boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
              }}
            >
              <div className="relative overflow-y-auto p-6 pb-8">
                {/* 头部 */}
                <div className="sticky -top-6 z-10 -mx-6 mb-4 flex items-center justify-between border-b border-archive-wood/8 bg-[#FAF6EE] px-6 py-3">
                  <span className="text-archive-wood/50 text-xs font-serif">失物 #{selectedItem.id}</span>
                  <button
                    onClick={handleClose}
                    className="rounded-full border border-archive-wood/12 bg-white px-3 py-1 text-xs text-archive-wood/65 hover:text-archive-wood"
                    aria-label="返回失物柜"
                  >
                    返回失物柜
                  </button>
                </div>

                {/* 标题 */}
                <h3 className="text-archive-wood text-lg font-serif mb-4">
                  {selectedItem.title}
                </h3>

                {/* 物品列表 */}
                <div className="space-y-3">
                  {/* 票根 */}
                  <div className="rounded-lg border border-archive-wood/10 bg-white p-3">
                    <p className="text-archive-wood/60 text-xs mb-1">票根</p>
                    <p className="text-archive-wood text-sm font-serif">
                      {selectedItem.artist} 现场记忆档案
                    </p>
                    <p className="text-archive-wood/50 text-xs mt-1">
                      {selectedItem.isCurrent ? '本次记忆档案' : '上海'} · {selectedItem.date}
                    </p>
                  </div>

                  {/* 照片 */}
                  <div className="rounded-lg border border-archive-wood/10 bg-white p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-archive-wood/60 text-xs">现场照片册</p>
                      {selectedItem.isCurrent && (
                        <label className="text-[11px] text-archive-gold cursor-pointer">
                          继续添加
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={handlePhotoUpload}
                          />
                        </label>
                      )}
                    </div>
                    <label className={selectedItem.isCurrent ? 'block cursor-pointer' : 'block'}>
                      {selectedItem.isCurrent && (
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={handlePhotoUpload}
                        />
                      )}
                      {displayPhotos.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2">
                          {displayPhotos.slice(0, 9).map((photo, index) => (
                            <div
                              key={`${photo}-${index}`}
                              className="relative aspect-square bg-archive-wood/20 rounded overflow-hidden"
                            >
                              <img
                                src={photo}
                                alt={`现场照片 ${index + 1}`}
                                className="h-full w-full object-cover"
                              />
                              {selectedItem.isCurrent && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    removePhoto(index)
                                  }}
                                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[11px] text-white shadow"
                                  aria-label={`移除现场照片 ${index + 1}`}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="aspect-video flex items-center justify-center rounded-lg bg-[#F0EAE0] px-4 text-center">
                          <span className="text-archive-wood/40 text-sm">
                            {selectedItem.isCurrent ? '添加现场照片，可以一次选择多张' : '还没有现场照片'}
                          </span>
                        </div>
                      )}
                    </label>
                  </div>

                  {/* 保管歌曲 */}
                  <div className="rounded-lg border border-archive-gold/25 bg-[#FBF5E8] p-3">
                    <p className="text-archive-wood/60 text-xs mb-1">保管歌曲</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-archive-gold/40 rounded-full flex items-center justify-center">
                        🎵
                      </div>
                      <div>
                        <p className="text-archive-wood font-serif">{selectedItem.song}</p>
                        <p className="text-archive-wood/50 text-xs">{selectedItem.artist}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-archive-wood/10 bg-white p-3">
                    <p className="text-archive-wood/60 text-xs mb-2">我的情绪标签</p>
                    {selectedItem.isCurrent ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {suggestedTags.map((tag) => {
                            const selected = displayTags.includes(tag)
                            return (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => toggleEmotionTag(tag)}
                                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                                  selected
                                    ? 'border-archive-gold bg-[#FBF0DC] text-archive-gold'
                                    : 'border-archive-wood/15 bg-[#F7F3EB] text-archive-wood/55'
                                }`}
                              >
                                {tag}
                              </button>
                            )
                          })}
                        </div>
                        <div className="flex gap-2">
                          <input
                            value={customTag}
                            onChange={(event) => setCustomTag(event.target.value.slice(0, 8))}
                            placeholder="自定义"
                            className="min-w-0 flex-1 rounded border border-archive-wood/12 bg-[#F7F3EB] px-3 py-2 text-xs text-archive-wood outline-none placeholder:text-archive-wood/35"
                          />
                          <button
                            type="button"
                            onClick={() => addCustomEmotionTag(customTag)}
                            className="rounded bg-archive-gold/25 px-3 py-2 text-xs text-archive-wood"
                          >
                            添加
                          </button>
                        </div>
                        <p className="text-[10px] text-archive-wood/40">
                          可多选，最多保留 5 个
                        </p>
                      </div>
                    ) : (
                      <p className="text-archive-gold text-xs font-serif">
                        {displayTags.join(' / ')}
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border border-archive-wood/10 bg-white p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-archive-wood/60 text-xs">我的备注</p>
                      {selectedItem.isCurrent && saveHint && (
                        <span className="text-[10px] text-archive-gold">{saveHint}</span>
                      )}
                    </div>
                    {selectedItem.isCurrent ? (
                      <>
                        <textarea
                          value={personalization.note}
                          onChange={(event) => handleNoteChange(event.target.value)}
                          maxLength={160}
                          placeholder="写一句只有你自己知道的现场备注"
                          className="w-full min-h-24 resize-none rounded-lg border border-archive-wood/12 bg-[#F7F3EB] p-3 text-archive-wood text-sm leading-relaxed outline-none placeholder:text-archive-wood/35"
                        />
                        <p className="mt-1 text-[10px] text-archive-wood/40 text-right">
                          {personalization.note.length}/160
                        </p>
                      </>
                    ) : (
                      <p className="text-archive-wood text-sm font-serif leading-relaxed">
                        {selectedItem.note}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
