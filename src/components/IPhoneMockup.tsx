'use client'

import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { ReactNode } from 'react'

const StarrySeaBackdrop = dynamic(() => import('@/components/StarrySeaBackdrop'), {
  ssr: false,
})

interface IPhoneMockupProps {
  children: ReactNode
  userMenu?: ReactNode
}

export default function IPhoneMockup({ children, userMenu }: IPhoneMockupProps) {
  return (
    // Outer page scrolls when the locked phone is taller than the viewport.
    // html/body stay overflow:hidden; this shell is the scroll container.
    <div className="relative h-dvh overflow-x-hidden overflow-y-auto bg-[#05070c]">
      <StarrySeaBackdrop />

      {/* Soft vignette so the phone stays the focal point */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            'radial-gradient(ellipse at 50% 45%, transparent 18%, rgba(5,7,12,0.35) 55%, rgba(5,7,12,0.72) 100%)',
        }}
      />

      {userMenu && (
        <div className="absolute right-5 top-5 z-30 md:right-8 md:top-7">
          {userMenu}
        </div>
      )}

      <div className="relative z-10 flex min-h-full items-center justify-center p-8">
      {/* iPhone 15 Pro mockup — width may shrink; height always follows 393:852 */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="relative shrink-0"
        style={{
          width: 'min(393px, calc(100vw - 64px))',
          aspectRatio: '393 / 852',
        }}
      >
        {/* Phone frame - Black Titanium */}
        <div
          className="absolute inset-0 rounded-[55px]"
          style={{
            background: 'linear-gradient(135deg, #2C2C2E 0%, #1C1C1E 50%, #3A3A3C 100%)',
            boxShadow: `
              0 50px 100px rgba(0, 0, 0, 0.55),
              0 20px 60px rgba(0, 0, 0, 0.4),
              0 0 80px rgba(232, 192, 120, 0.08),
              inset 0 2px 4px rgba(255, 255, 255, 0.1),
              inset 0 -2px 4px rgba(0, 0, 0, 0.3)
            `,
          }}
        />

        {/* Titanium texture overlay */}
        <div
          className="absolute inset-0 rounded-[55px] opacity-30"
          style={{
            background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.4'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Screen bezel */}
        <div
          className="absolute inset-[3px] rounded-[52px] bg-black"
          style={{
            boxShadow: 'inset 0 0 10px rgba(0, 0, 0, 0.5)',
          }}
        />

        {/* Dynamic Island */}
        <div
          className="hidden"
          style={{
            width: '126px',
            height: '37px',
            background: '#000',
            borderRadius: '20px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          }}
        />

        {/* Screen content area */}
        <div
          className="absolute inset-[3px] overflow-hidden rounded-[52px]"
          style={{
            background: '#0D0D0D',
          }}
        >
          <div
            className="phone-scroll h-full w-full overflow-x-hidden overflow-y-auto"
            style={{
              paddingTop: 0,
              paddingBottom: 0,
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-y',
            }}
          >
            <div className="relative h-full min-h-full w-full">
              {children}
            </div>
          </div>
        </div>

        {/* Side buttons - Volume */}
        <div
          className="pointer-events-none absolute left-[-3px] top-[180px] h-[30px] w-[3px] rounded-l-[2px]"
          style={{
            background: 'linear-gradient(to right, #1C1C1E, #3A3A3C)',
            boxShadow: 'inset -1px 0 2px rgba(255, 255, 255, 0.1)',
          }}
        />
        <div
          className="pointer-events-none absolute left-[-3px] top-[220px] h-[60px] w-[3px] rounded-l-[2px]"
          style={{
            background: 'linear-gradient(to right, #1C1C1E, #3A3A3C)',
            boxShadow: 'inset -1px 0 2px rgba(255, 255, 255, 0.1)',
          }}
        />
        <div
          className="pointer-events-none absolute left-[-3px] top-[290px] h-[60px] w-[3px] rounded-l-[2px]"
          style={{
            background: 'linear-gradient(to right, #1C1C1E, #3A3A3C)',
            boxShadow: 'inset -1px 0 2px rgba(255, 255, 255, 0.1)',
          }}
        />

        {/* Power button */}
        <div
          className="pointer-events-none absolute right-[-3px] top-[250px] h-[80px] w-[3px] rounded-r-[2px]"
          style={{
            background: 'linear-gradient(to left, #1C1C1E, #3A3A3C)',
            boxShadow: 'inset 1px 0 2px rgba(255, 255, 255, 0.1)',
          }}
        />

        {/* Hardware reflection */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[55px] opacity-5"
          style={{
            background: 'linear-gradient(135deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%)',
          }}
        />
      </motion.div>
      </div>
    </div>
  )
}
