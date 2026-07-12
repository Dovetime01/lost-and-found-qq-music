// src/components/MemoryCheckin.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import StarrySeaBackground from '@/components/StarrySeaBackground'
import { playSound } from '@/lib/soundEffects'
import type { ConcertInfo } from '@/lib/analysis'
import type { TicketExtractionResult, TicketExtractionSource } from '@/lib/ticketExtraction'

interface MemoryCheckinProps {
  onNext: (info: ConcertInfo) => void
}

const MAX_TICKET_BYTES = 12 * 1024 * 1024
const TICKET_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

function normalizeTicketImage(file: File) {
  if (file.type.startsWith('image/')) return file
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const inferredType = TICKET_MIME_BY_EXTENSION[extension]
  return inferredType
    ? new File([file], file.name, { type: inferredType, lastModified: file.lastModified })
    : null
}

export default function MemoryCheckin({ onNext }: MemoryCheckinProps) {
  const [formData, setFormData] = useState<ConcertInfo>({
    concertName: '',
    artist: '',
    date: '',
    city: '',
    venue: '',
  })
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [entryMode, setEntryMode] = useState<'ai' | 'manual'>('ai')
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionResult, setExtractionResult] = useState<{
    source: TicketExtractionSource
    confidence: number
    needsReview: boolean
    message: string
    rawText?: string
  } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showTicket, setShowTicket] = useState(false)
  const [ticketPasted, setTicketPasted] = useState(false)
  const [isDraggingTicket, setIsDraggingTicket] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dustParticles, setDustParticles] = useState<any[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const timerRefs = useRef<NodeJS.Timeout[]>([])
  const extractionRequestId = useRef(0)
  const hasSubmitted = useRef(false) // 防止重复提交

  useEffect(() => {
    const particles = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 4,
      duration: 6 + Math.random() * 4,
      size: 0.8 + Math.random() * 2,
    }))
    setDustParticles(particles)
  }, [])

  // 清理所有定时器
  useEffect(() => {
    return () => {
      timerRefs.current.forEach(timer => clearTimeout(timer))
    }
  }, [])

  const fallbackConcertInfo: ConcertInfo = {
    concertName: '待确认现场',
    artist: '待确认艺人',
    date: '待确认日期',
    city: '待确认城市',
    venue: '待确认场馆',
  }

  const startManualEntry = () => {
    playSound('page')
    extractionRequestId.current += 1
    setEntryMode('manual')
    setUploadedImage(null)
    setUploadError('')
    setIsDraggingTicket(false)
    setIsExtracting(false)
    setExtractionResult({
      source: 'demo-fallback',
      confidence: 1,
      needsReview: false,
      message: '已切换为手动填写。你可以直接输入演出名称、艺人、日期、城市和场馆。',
    })
    setFormData({
      concertName: '',
      artist: '',
      date: '',
      city: '',
      venue: '',
    })
    hasSubmitted.current = false
  }

  const handleTicketFile = (candidate?: File) => {
    if (!candidate) return
    const file = normalizeTicketImage(candidate)
    if (!file) {
      setUploadError('请选择 JPG、PNG 或 WebP 图片。')
      return
    }
    if (file.size <= 0 || file.size > MAX_TICKET_BYTES) {
      setUploadError('票根图片需小于 12MB。')
      return
    }

    playSound('page')
    setUploadError('')
    setIsExtracting(true)
    setExtractionResult(null)
    setEntryMode('ai')
    hasSubmitted.current = false
    const currentRequestId = extractionRequestId.current + 1
    extractionRequestId.current = currentRequestId
    const reader = new FileReader()
    reader.onloadend = async () => {
      const imageData = typeof reader.result === 'string' ? reader.result : ''
      if (extractionRequestId.current !== currentRequestId) return
      if (!imageData.startsWith('data:image/')) {
        setUploadError('图片读取失败，请重新选择文件。')
        setIsExtracting(false)
        return
      }
      setUploadedImage(imageData)

      try {
        const response = await fetch('/api/extract-concert-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            imageData,
          }),
        })

        if (!response.ok) throw new Error('ticket extraction failed')

        const result = await response.json() as TicketExtractionResult
        if (extractionRequestId.current !== currentRequestId) return
        setFormData(result.concertInfo)
        setExtractionResult({
          source: result.source,
          confidence: result.confidence,
          needsReview: result.needsReview,
          message: result.message,
          rawText: result.rawText,
        })
      } catch {
        if (extractionRequestId.current !== currentRequestId) return
        setFormData(fallbackConcertInfo)
        setExtractionResult({
          source: 'demo-fallback',
          confidence: 0.2,
          needsReview: true,
          message: 'AI 识别请求没有成功返回。请检查 API 配置或网络，也可以切换为手动填写后继续。',
        })
      } finally {
        if (extractionRequestId.current === currentRequestId) {
          setIsExtracting(false)
        }
      }
    }
    reader.onerror = () => {
      if (extractionRequestId.current !== currentRequestId) return
      setUploadError('图片读取失败，请重新选择文件。')
      setIsExtracting(false)
    }
    reader.readAsDataURL(file)
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleTicketFile(event.target.files?.[0])
    event.target.value = ''
  }

  const handleSubmit = () => {
    // 防止重复提交 - 使用 ref 确保只执行一次
    if (!formData.concertName || !formData.artist || isGenerating || hasSubmitted.current) return
    
    hasSubmitted.current = true // 标记为已提交
    playSound('stamp')
    setIsGenerating(true)
    
    // 清理之前的定时器
    timerRefs.current.forEach(timer => clearTimeout(timer))
    timerRefs.current = []
    
    // 第一步：显示票根
    const timer1 = setTimeout(() => {
      setIsGenerating(false)
      setShowTicket(true)
      playSound('stamp')
      
      // 第二步：贴纸动画
      const timer2 = setTimeout(() => {
        setTicketPasted(true)
        playSound('stamp')
        
        // 第三步：跳转到下一页
        const timer3 = setTimeout(() => {
          onNext({
            ...formData,
            ticketOCR: extractionResult?.rawText?.trim() || undefined,
          })
        }, 650)
        
        timerRefs.current.push(timer3)
      }, 550)
      
      timerRefs.current.push(timer2)
    }, 550)
    
    timerRefs.current.push(timer1)
  }

  const canSubmit = formData.concertName && formData.artist && formData.date

  return (
    <div className="relative h-full min-h-full overflow-x-hidden overflow-y-auto bg-[#06080e]">
      <StarrySeaBackground />

      {/* === 胶片颗粒 === */}
      <div
        className="pointer-events-none absolute inset-0 z-50 opacity-[0.08]"
        style={{
          background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='5'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* === 灰尘粒子 === */}
      {dustParticles.map((p: any) => (
        <motion.div
          key={p.id}
          className="pointer-events-none absolute z-[1] rounded-full"
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

      {/* Soft bottom fade for form legibility on bright water */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-[1] h-2/5"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(6, 8, 14, 0.35) 55%, rgba(6, 8, 14, 0.55) 100%)',
        }}
      />

      {/* 内容区：固定上边距下移，不依赖百分比居中 */}
      <div className="relative z-10 px-4 pb-10" style={{ paddingTop: 72 }}>
      {/* === 标题 === */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative z-10 mb-6 text-center"
      >
        <div className="inline-block px-3 py-1 mb-3 border border-archive-gold/40" style={{ transform: 'rotate(-2deg)' }}>
          <span className="text-[10px] tracking-[0.3em] text-archive-gold/70 font-serif">STEP 01</span>
        </div>
        <h1 className="text-xl font-serif text-archive-paper tracking-wide mb-2">票根登记</h1>
        <p className="text-archive-paper/50 text-xs">上传包含艺人、场馆、日期的票根或订单截图</p>
      </motion.div>

      <div className="relative z-10 mx-auto mb-4 flex max-w-md gap-2">
        <button
          type="button"
          onClick={() => {
            setEntryMode('ai')
            setExtractionResult(null)
            setUploadError('')
          }}
          style={{
            flex: '1 1 0',
            height: 40,
            minHeight: 40,
            maxHeight: 40,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: entryMode === 'ai' ? 'rgba(201, 164, 106, 0.7)' : 'rgba(201, 164, 106, 0.25)',
            background: entryMode === 'ai' ? 'rgba(201, 164, 106, 0.15)' : 'transparent',
            color: entryMode === 'ai' ? '#C9A46A' : 'rgba(233, 223, 200, 0.6)',
          }}
          className="rounded text-xs font-serif leading-none"
        >
          AI 识别票根
        </button>
        <button
          type="button"
          onClick={startManualEntry}
          style={{
            flex: '1 1 0',
            height: 40,
            minHeight: 40,
            maxHeight: 40,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: entryMode === 'manual' ? 'rgba(201, 164, 106, 0.7)' : 'rgba(201, 164, 106, 0.25)',
            background: entryMode === 'manual' ? 'rgba(201, 164, 106, 0.15)' : 'transparent',
            color: entryMode === 'manual' ? '#C9A46A' : 'rgba(233, 223, 200, 0.6)',
          }}
          className="rounded text-xs font-serif leading-none"
        >
          我自己输入
        </button>
      </div>

      {/* === 登记簿（像翻开的笔记本）=== */}
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="relative z-10 max-w-md mx-auto"
      >
        {/* 笔记本封面 */}
        <div
          className="relative rounded-lg overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #E9DFC8 0%, #D4C8B0 50%, #E9DFC8 100%)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5), inset 0 0 30px rgba(0,0,0,0.05)',
          }}
        >
          {/* 纸张纹理 */}
          <div
            className="absolute inset-0 opacity-40"
            style={{
              background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paper)' opacity='0.3'/%3E%3C/svg%3E")`,
            }}
          />

          {/* 泛黄斑点 */}
          <div className="absolute top-12 right-16 w-24 h-24 rounded-full opacity-[0.08]"
            style={{ background: 'radial-gradient(circle, rgba(139, 90, 43, 0.4) 0%, transparent 70%)' }}
          />
          <div className="absolute bottom-20 left-20 w-16 h-16 rounded-full opacity-[0.06]"
            style={{ background: 'radial-gradient(circle, rgba(139, 90, 43, 0.3) 0%, transparent 70%)' }}
          />

          {/* 左页：上传区 */}
          <div className="p-6 pb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-archive-gold/60" />
              <h3 className="text-sm font-serif text-archive-wood/80 tracking-wide">演出票根</h3>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={handleFileUpload}
              className="hidden"
            />

            {uploadedImage ? (
              <motion.div
                initial={{ scale: 0.9, rotate: -3, opacity: 0 }}
                animate={{ scale: 1, rotate: -2, opacity: 1 }}
                className="relative"
              >
                {/* 胶带固定效果 */}
                <div className="absolute -top-2 left-8 w-16 h-4 bg-yellow-100/40 z-10" style={{ transform: 'rotate(-2deg)' }} />
                <div className="absolute -top-2 right-8 w-16 h-4 bg-yellow-100/40 z-10" style={{ transform: 'rotate(2deg)' }} />

                {/* 票根照片 */}
                <div className="relative rounded border-2 border-archive-wood/20 overflow-hidden bg-white">
                  <img
                    src={uploadedImage}
                    alt="演出票根预览"
                    className="w-full h-48 object-cover"
                  />
                  <button
                    onClick={() => {
                      extractionRequestId.current += 1
                      setUploadedImage(null)
                      setFormData({ concertName: '', artist: '', date: '', city: '', venue: '' })
                      setExtractionResult(null)
                      setUploadError('')
                      setIsExtracting(false)
                      hasSubmitted.current = false
                    }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-600/80 text-white text-xs flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>

                {/* 手写标注 */}
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 }}
                  className="absolute -right-3 top-1/2 -translate-y-1/2"
                >
                  <div className="w-0.5 h-12 bg-archive-gold/40" />
                  <p className="absolute left-2 top-4 text-[10px] text-archive-gold/70 whitespace-nowrap font-serif italic" style={{ transform: 'rotate(2deg)' }}>
                    那一晚 ↗
                  </p>
                </motion.div>

                <div className="mt-4 rounded border border-archive-wood/15 bg-archive-wood/5 px-3 py-2">
                  <p className="text-[10px] font-serif tracking-[0.18em] text-archive-wood/45">
                    TICKET OCR
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-archive-wood/70">
                    {isExtracting
                      ? '正在调用百度 OCR + 豆包识别票根信息，请稍等；不会自动切换为手动填写。'
                      : extractionResult?.message ?? '上传后将自动识别演出信息，可手动修改。'}
                  </p>
                  {extractionResult && !isExtracting && (
                    <div className="mt-2 flex items-center justify-between text-[10px] text-archive-wood/45">
                      <span>
                        {extractionResult.source === 'local-rule'
                          ? '本地识别'
                          : extractionResult.source === 'ocr-ark'
                            ? '百度 OCR + 豆包识别'
                            : '待确认'}
                      </span>
                      <span>{Math.round(extractionResult.confidence * 100)}% CONFIDENCE</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="space-y-3">
                {entryMode === 'manual' ? (
                  <div
                    className="w-full rounded border-2 border-dashed border-archive-wood/25 p-8 text-center"
                    style={{ minHeight: '160px' }}
                  >
                    <p className="text-archive-wood/70 text-sm font-serif italic mb-1">
                      手动登记演出信息
                    </p>
                    <p className="text-archive-wood/40 text-xs">
                      适合没有票根、票根太糊，或想直接体验完整流程
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragEnter={(event) => {
                      event.preventDefault()
                      setIsDraggingTicket(true)
                    }}
                    onDragOver={(event) => {
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'copy'
                      setIsDraggingTicket(true)
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setIsDraggingTicket(false)
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      setIsDraggingTicket(false)
                      handleTicketFile(event.dataTransfer.files?.[0])
                    }}
                    className={`w-full rounded border-2 border-dashed p-8 text-center transition-colors ${
                      isDraggingTicket
                        ? 'border-archive-gold bg-archive-gold/15'
                        : 'border-archive-wood/30 hover:border-archive-gold/50'
                    }`}
                    style={{ minHeight: '200px' }}
                  >
                    <motion.div
                      animate={{ y: [0, -6, 0] }}
                      transition={{ duration: 2.5, repeat: Infinity }}
                    >
                      <span className="text-5xl block mb-3">📤</span>
                      <p className="text-archive-wood/70 text-sm font-serif italic mb-1">
                        {isDraggingTicket ? '松开即可上传票根' : '点击或拖动上传演出票根'}
                      </p>
                      <p className="text-archive-wood/40 text-xs">
                        JPG、PNG、WebP · 不超过 12MB
                      </p>
                    </motion.div>
                  </button>
                )}
                {uploadError && (
                  <p role="alert" className="rounded bg-red-900/10 px-3 py-2 text-xs text-red-900/75">
                    {uploadError}
                  </p>
                )}
              </div>
            )}

            {/* 右页：表单区（只在上传后显示）*/}
            {(uploadedImage || entryMode === 'manual') && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-6 space-y-4"
              >
                {/* 横线纸效果 */}
                <div className="space-y-4">
                  {/* 演出名称 */}
                  <div className="relative">
                    <label className="block text-[11px] text-archive-wood/50 mb-1 font-serif">演出名称</label>
                    <div className="relative">
                      <div className="absolute bottom-0 left-0 right-0 h-px bg-archive-wood/20" />
                      <input
                        type="text"
                        value={formData.concertName}
                        onChange={(e) => setFormData(prev => ({ ...prev, concertName: e.target.value }))}
                        disabled={isExtracting}
                        className="w-full pb-2 bg-transparent text-archive-wood font-serif text-sm outline-none"
                        style={{ caretColor: '#C9A46A' }}
                      />
                    </div>
                  </div>

                  {/* 艺人 + 日期 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative">
                      <label className="block text-[11px] text-archive-wood/50 mb-1 font-serif">艺人</label>
                      <div className="relative">
                        <div className="absolute bottom-0 left-0 right-0 h-px bg-archive-wood/20" />
                        <input
                          type="text"
                          value={formData.artist}
                          onChange={(e) => setFormData(prev => ({ ...prev, artist: e.target.value }))}
                          disabled={isExtracting}
                          className="w-full pb-2 bg-transparent text-archive-wood font-serif text-sm outline-none"
                        />
                      </div>
                    </div>
                    <div className="relative">
                      <label className="block text-[11px] text-archive-wood/50 mb-1 font-serif">日期</label>
                      <div className="relative">
                        <div className="absolute bottom-0 left-0 right-0 h-px bg-archive-wood/20" />
                        <input
                          type="text"
                          value={formData.date}
                          onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                          disabled={isExtracting}
                          className="w-full pb-2 bg-transparent text-archive-wood font-serif text-sm outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 城市 + 场馆 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative">
                      <label className="block text-[11px] text-archive-wood/50 mb-1 font-serif">城市</label>
                      <div className="relative">
                        <div className="absolute bottom-0 left-0 right-0 h-px bg-archive-wood/20" />
                        <input
                          type="text"
                          value={formData.city}
                          onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                          disabled={isExtracting}
                          className="w-full pb-2 bg-transparent text-archive-wood font-serif text-sm outline-none"
                        />
                      </div>
                    </div>
                    <div className="relative">
                      <label className="block text-[11px] text-archive-wood/50 mb-1 font-serif">场馆</label>
                      <div className="relative">
                        <div className="absolute bottom-0 left-0 right-0 h-px bg-archive-wood/20" />
                        <input
                          type="text"
                          value={formData.venue}
                          onChange={(e) => setFormData(prev => ({ ...prev, venue: e.target.value }))}
                          disabled={isExtracting}
                          className="w-full pb-2 bg-transparent text-archive-wood font-serif text-sm outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* 笔记本装订孔 */}
          <div className="absolute left-8 top-0 bottom-0 flex flex-col justify-around py-12">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-archive-wood/20" />
            ))}
          </div>
        </div>

        {/* 提交按钮 */}
        {(uploadedImage || entryMode === 'manual') && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            onClick={handleSubmit}
            disabled={!canSubmit || isGenerating || isExtracting}
            whileHover={canSubmit && !isGenerating && !isExtracting ? { y: -2, scale: 1.01 } : {}}
            whileTap={canSubmit && !isGenerating && !isExtracting ? { scale: 0.98 } : {}}
            className="relative w-full mt-5 py-4 overflow-hidden"
            style={{
              background: canSubmit && !isGenerating && !isExtracting
                ? 'linear-gradient(135deg, #C9A46A 0%, #E9D4A0 100%)'
                : 'rgba(59, 42, 34, 0.4)',
              color: canSubmit && !isGenerating && !isExtracting ? '#0D0D0D' : '#666',
              boxShadow: canSubmit && !isGenerating && !isExtracting
                ? '0 6px 20px rgba(201, 164, 106, 0.4)'
                : 'none',
              cursor: canSubmit && !isGenerating && !isExtracting ? 'pointer' : 'not-allowed',
            }}
          >
            {/* 内部光晕 */}
            {canSubmit && !isGenerating && !isExtracting && (
              <motion.div
                className="absolute inset-0 opacity-30"
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: 2, repeat: Infinity }}
                style={{
                  background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.4) 0%, transparent 70%)',
                }}
              />
            )}

            <span className="relative font-serif text-sm tracking-[0.3em]">
              {isExtracting ? (
                <span className="flex items-center justify-center gap-2">
                  <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                    ⟳
                  </motion.span>
                  识别中...
                </span>
              ) : isGenerating ? (
                <span className="flex items-center justify-center gap-2">
                  <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                    ⟳
                  </motion.span>
                  生成中...
                </span>
              ) : '生成登记票根'}
            </span>
          </motion.button>
        )}
      </motion.div>
      </div>

      {/* === 生成的票根（贴纸动画）=== */}
      <AnimatePresence>
        {showTicket && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => {}}
          >
            {/* 票根 */}
            <motion.div
              initial={{ scale: 0.3, rotate: -20, y: -200 }}
              animate={{
                scale: ticketPasted ? 1 : 0.85,
                rotate: ticketPasted ? -3 : 0,
                y: 0,
              }}
              transition={{ type: 'spring', stiffness: 100, damping: 15 }}
              className="relative max-w-sm w-full"
            >
              {/* 胶带 */}
              {ticketPasted && (
                <>
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.2 }}
                    className="absolute -top-3 left-12 w-20 h-5 bg-yellow-100/50 z-10"
                    style={{ transform: 'rotate(-3deg)' }}
                  />
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.3 }}
                    className="absolute -top-3 right-12 w-20 h-5 bg-yellow-100/50 z-10"
                    style={{ transform: 'rotate(3deg)' }}
                  />
                </>
              )}

              {/* 票根主体 */}
              <div
                className="relative rounded overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #E9DFC8 0%, #F5E8C7 100%)',
                  boxShadow: ticketPasted
                    ? '0 25px 60px rgba(0,0,0,0.6)'
                    : '0 40px 80px rgba(0,0,0,0.7)',
                }}
              >
                {/* 纸张纹理 */}
                <div
                  className="absolute inset-0 opacity-30"
                  style={{
                    background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulance type='fractalNoise' baseFrequency='0.6' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.3'/%3E%3C/svg%3E")`,
                  }}
                />

                <div className="p-6">
                  {/* 顶部标识 */}
                  <div className="text-center mb-4">
                    <p className="text-[10px] tracking-[0.3em] text-archive-wood/40 font-sans">CONCERT TICKET</p>
                    <h3 className="text-archive-wood font-serif text-lg font-bold mt-1 leading-tight">
                      {formData.concertName}
                    </h3>
                  </div>

                  {/* 撕裂线 */}
                  <div className="flex justify-center gap-1 my-4">
                    {Array.from({ length: 20 }).map((_, i) => (
                      <div key={i} className="w-1 h-2 rounded-full bg-archive-wood/20" />
                    ))}
                  </div>

                  {/* 信息网格 */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <p className="text-archive-wood/40 text-[10px] font-sans mb-0.5">ARTIST</p>
                      <p className="text-archive-wood font-serif text-sm">{formData.artist}</p>
                    </div>
                    <div>
                      <p className="text-archive-wood/40 text-[10px] font-sans mb-0.5">DATE</p>
                      <p className="text-archive-wood font-serif text-sm">{formData.date}</p>
                    </div>
                    <div>
                      <p className="text-archive-wood/40 text-[10px] font-sans mb-0.5">CITY</p>
                      <p className="text-archive-wood font-serif text-sm">{formData.city}</p>
                    </div>
                    <div>
                      <p className="text-archive-wood/40 text-[10px] font-sans mb-0.5">VENUE</p>
                      <p className="text-archive-wood font-serif text-sm">{formData.venue}</p>
                    </div>
                  </div>

                  {/* 底部条码 */}
                  <div className="pt-3 border-t border-archive-wood/15 flex justify-between items-center">
                    <span className="text-archive-wood/30 text-[10px] font-sans">SEAT A12 · ROW 23</span>
                    <span className="text-archive-wood/30 text-[10px] font-sans">ENTRY</span>
                  </div>
                </div>

                {/* 已登记印章 */}
                {ticketPasted && (
                  <motion.div
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: -12 }}
                    transition={{ delay: 0.5, type: 'spring' }}
                    className="absolute top-4 right-4 px-3 py-1.5 border-2 border-red-600 font-serif text-sm font-bold text-red-600"
                    style={{ opacity: 0.85 }}
                  >
                    已登记
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
