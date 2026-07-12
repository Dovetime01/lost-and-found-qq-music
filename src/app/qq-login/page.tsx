'use client'

import { useRouter } from 'next/navigation'
import QQMusicLoginGate from '@/components/QQMusicLoginGate'

export default function QQLoginPage() {
  const router = useRouter()
  return (
    <QQMusicLoginGate
      standalone
      onAuthenticated={() => router.push('/')}
    />
  )
}
