import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '失物招领处 | Lost & Found',
  description: '有些东西并没有丢失。它们只是暂时被留在了音乐里。',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}