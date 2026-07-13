'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type {
  QQMusicAuthResult,
  QQMusicUserSession,
} from '@/lib/qqMusicAuthTypes'

type LoginPhase =
  | 'creating'
  | 'waiting'
  | 'confirming'
  | 'authorizing'
  | 'ready'
  | 'error'

interface QQMusicLoginGateProps {
  onAuthenticated: (session: QQMusicUserSession) => void
  standalone?: boolean
}

const statusCopy: Record<LoginPhase, string> = {
  creating: '正在取回入场凭证…',
  waiting: '等待扫码',
  confirming: '已扫码，请在手机上确认',
  authorizing: '正在整理你的音乐身份…',
  ready: '授权完成，欢迎回来',
  error: '这张凭证暂时失效了',
}

export default function QQMusicLoginGate({
  onAuthenticated,
  standalone = false,
}: QQMusicLoginGateProps) {
  const [phase, setPhase] = useState<LoginPhase>('creating')
  const [qrValue, setQrValue] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [error, setError] = useState('')
  const [session, setSession] = useState<QQMusicUserSession | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const completingRef = useRef(false)

  const qrImage = useMemo(
    () => qrValue
      ? `https://api.qrserver.com/v1/create-qr-code/?size=272x272&margin=10&data=${encodeURIComponent(qrValue)}`
      : '',
    [qrValue]
  )

  const stopPolling = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  const finishAuthorization = useCallback(async (code: string) => {
    if (completingRef.current) return
    completingRef.current = true
    stopPolling()
    setPhase('authorizing')

    try {
      const response = await fetch('/api/qq-music/auth/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const payload = await response.json() as QQMusicAuthResult | { ok: false; error?: string }
      if (!response.ok || !payload.ok) {
        throw new Error('error' in payload ? payload.error : '授权没有完成')
      }
      setSession(payload.session)
      setPhase('ready')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '授权没有完成')
      setPhase('error')
    } finally {
      completingRef.current = false
    }
  }, [stopPolling])

  const beginPolling = useCallback((code: string) => {
    stopPolling()
    setPhase('waiting')
    timerRef.current = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/qq-music/auth/poll?authCode=${encodeURIComponent(code)}`
        )
        const payload = await response.json() as {
          ok: boolean
          status?: string
          code?: string | null
          error?: string
        }
        if (!response.ok || !payload.ok) throw new Error(payload.error || '授权状态获取失败')

        if (payload.status === 'scanned_waiting_confirm') setPhase('confirming')
        if (payload.status === 'authorized' && payload.code) {
          void finishAuthorization(payload.code)
        }
        if (['expired', 'cancelled', 'wechat_auth_revoked', 'account_restricted'].includes(payload.status ?? '')) {
          throw new Error(payload.status === 'expired' ? '二维码已过期，请刷新' : '本次授权未完成')
        }
      } catch (reason) {
        stopPolling()
        setError(reason instanceof Error ? reason.message : '授权状态获取失败')
        setPhase('error')
      }
    }, 1200)
  }, [finishAuthorization, stopPolling])

  const createQrCode = useCallback(async () => {
    stopPolling()
    completingRef.current = false
    setPhase('creating')
    setError('')
    setSession(null)
    setQrValue('')
    setAuthCode('')

    try {
      const response = await fetch('/api/qq-music/auth/qrcode', { method: 'POST' })
      const payload = await response.json() as {
        ok: boolean
        sdkQrCode?: string
        authCode?: string
        error?: string
      }
      if (!response.ok || !payload.ok || !payload.sdkQrCode || !payload.authCode) {
        throw new Error(payload.error || '无法生成授权二维码')
      }
      setQrValue(payload.sdkQrCode)
      setAuthCode(payload.authCode)
      beginPolling(payload.authCode)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法生成授权二维码')
      setPhase('error')
    }
  }, [beginPolling, stopPolling])

  useEffect(() => {
    void createQrCode()
    return stopPolling
    // The login flow should bootstrap exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="relative flex h-dvh min-h-[620px] w-full items-center justify-center overflow-hidden bg-[#0b0b0b] px-5 py-8 text-[#E9DFC8]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(201,164,106,0.20),transparent_32%),radial-gradient(circle_at_18%_86%,rgba(72,50,35,0.42),transparent_38%)]" />
      <div className="absolute bottom-0 left-0 right-0 h-[32%] bg-[linear-gradient(180deg,rgba(32,23,18,0),#211711)]" />
      <div className="paper-texture absolute inset-0 opacity-20" />

      <div className="relative z-10 flex w-full max-w-[920px] flex-col items-center">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="grid w-full overflow-hidden border border-[#C9A46A]/30 bg-[#11100e]/90 shadow-[0_35px_100px_rgba(0,0,0,.65)] backdrop-blur md:grid-cols-[1.05fr_.95fr]"
        >
        <div className="flex min-h-[310px] flex-col justify-between border-b border-[#C9A46A]/20 p-7 md:min-h-[570px] md:border-b-0 md:border-r md:p-12">
          <div>
            <div className="mb-8 flex items-center gap-3 text-[10px] tracking-[0.28em] text-[#C9A46A]">
              <span className="h-px w-9 bg-[#C9A46A]/70" />
              LOST &amp; FOUND · DEMO
            </div>
            <h1 className="max-w-[420px] text-[clamp(34px,6vw,64px)] font-normal leading-[1.08] tracking-[-0.04em]">
              先认领你的
              <br />
              音乐身份
            </h1>
            <p className="mt-6 max-w-[390px] text-sm leading-7 text-[#E9DFC8]/65 md:text-base">
              登录 QQ音乐，我们会借用你的音乐权益，为这段现场记忆找回可以播放的声音。
            </p>
          </div>
          <div className="mt-8 flex gap-6 text-[11px] tracking-[0.08em] text-[#E9DFC8]/40">
            <span>01 · 扫码授权</span>
            <span>02 · 找回记忆</span>
            <span>03 · 收听归途</span>
          </div>
        </div>

        <div className="flex min-h-[430px] flex-col items-center justify-center p-7 md:p-12">
          <AnimatePresence mode="wait">
            {phase === 'ready' && session ? (
              <motion.div
                key="ready"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex w-full max-w-[300px] flex-col items-center text-center"
              >
                <div className="mb-5 grid h-20 w-20 place-items-center overflow-hidden rounded-full border border-[#C9A46A]/60 bg-[#C9A46A]/10 text-2xl">
                  {session.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={session.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    session.nickname.slice(0, 1)
                  )}
                </div>
                <p className="text-xs tracking-[0.2em] text-[#C9A46A]">CLAIMED</p>
                <h2 className="mt-3 text-2xl">{session.nickname}</h2>
                <span className="mt-3 border border-[#C9A46A]/35 px-3 py-1 text-[11px] text-[#C9A46A]">
                  {session.accessLabel}
                </span>
                <button
                  type="button"
                  onClick={() => onAuthenticated(session)}
                  className="mt-9 w-full bg-[#E9DFC8] px-5 py-3.5 text-sm tracking-[0.12em] text-[#17130f] transition hover:bg-white"
                >
                  进入失物招领处
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="qr"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex w-full flex-col items-center text-center"
              >
                <div className="relative grid h-[244px] w-[244px] place-items-center bg-[#f4efe5] p-3 shadow-[0_12px_45px_rgba(0,0,0,.35)] sm:h-[272px] sm:w-[272px]">
                  {qrImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrImage} alt="QQ音乐登录二维码" className="h-full w-full" />
                  ) : (
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2f291f]/20 border-t-[#2f291f]" />
                  )}
                  {phase === 'authorizing' && (
                    <div className="absolute inset-0 grid place-items-center bg-[#f4efe5]/95 text-sm text-[#29231c]">
                      正在授权…
                    </div>
                  )}
                </div>
                <p className="mt-5 text-sm text-[#E9DFC8]/85">{statusCopy[phase]}</p>
                <p className="mt-2 text-xs leading-5 text-[#E9DFC8]/45">
                  使用 QQ音乐、微信或 QQ 扫码
                  <br />
                  授权有效期约 10 分钟
                </p>
                {(phase === 'error' || authCode) && (
                  <button
                    type="button"
                    onClick={() => void createQrCode()}
                    className="mt-5 border-b border-[#C9A46A]/60 pb-1 text-xs tracking-[0.12em] text-[#C9A46A]"
                  >
                    {phase === 'error' ? error || '重新生成二维码' : '刷新二维码'}
                  </button>
                )}
                {standalone && qrValue && (
                  <a
                    href={qrValue}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 text-[11px] text-[#E9DFC8]/35 underline"
                  >
                    在当前设备打开授权页
                  </a>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </motion.section>

        <p className="mt-10 whitespace-nowrap text-center text-base leading-7 text-[#E9DFC8]/40">
          点击
          <a
            href="/api/download-sample"
            className="text-[#C9A46A] underline underline-offset-2 transition hover:text-[#E9DFC8]"
          >
            此处
          </a>
          下载我们提供的示例文件，如果你有演唱会相关的照片和视频也可以使用自己的，视频要求在&nbsp;4-5MB&nbsp;以下
        </p>
      </div>
    </main>
  )
}
