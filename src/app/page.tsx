'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import IPhoneMockup from '@/components/IPhoneMockup'
import OpeningScreen from '@/components/OpeningScreen'
import MemoryCheckin from '@/components/MemoryCheckin'
import EvidenceCollection from '@/components/EvidenceCollection'
import SearchingAnimation from '@/components/SearchingAnimation'
import ListenFirstScreen from '@/components/ListenFirstScreen'
import LostItemIdentification from '@/components/LostItemIdentification'
import RecoveryRoute from '@/components/RecoveryRoute'
import PlaybackScreen from '@/components/PlaybackScreen'
import MyLostCabinet from '@/components/MyLostCabinet'
import PublicLostWall from '@/components/PublicLostWall'
import EndingScreen from '@/components/EndingScreen'
import QQMusicLoginGate from '@/components/QQMusicLoginGate'
import QQMusicUserMenu from '@/components/QQMusicUserMenu'
import { useMemoryPipeline } from '@/hooks/useMemoryPipeline'
import { playSound } from '@/lib/soundEffects'
import { startBgm } from '@/lib/bgm'
import {
  analyzeMemory,
  type ConcertInfo,
  type EvidenceInput,
  type MemoryProfile,
} from '@/lib/analysis'
import type { AnalysisProviderStatus } from '@/lib/aiAnalysis'
import {
  createArchiveItem,
  loadLatestArchive,
  saveLatestArchive,
  type ArchiveItem,
} from '@/lib/archive'
import {
  getOrCreateLocalUserIdentity,
  type LocalUserIdentity,
} from '@/lib/userIdentity'
import {
  finishArtistPrefetch,
  startArtistPrefetch,
  type ArtistCatalogSessionState,
  type ArtistPrefetchResult,
} from '@/lib/artistPrefetch'
import type { EvidenceMediaBundle, RadioStep, SongAnchor } from '@/lib/pipelineTypes'
import type { Song } from '@/lib/songs'
import type { QQMusicUserSession } from '@/lib/qqMusicAuthTypes'

type AnalysisSource = 'ai' | 'rule' | 'fallback'

const defaultConcertInfo: ConcertInfo = {
  concertName: '待确认现场',
  artist: '待确认艺人',
  date: '待确认日期',
  city: '待确认城市',
  venue: '待确认场馆',
}

const defaultProviderStatus: AnalysisProviderStatus = {
  recommendationMode: 'local-fallback',
  canRecommendAnyArtist: false,
  label: '多模态记忆管线',
  description: '现场线索会分别整理，接口不可用时保留本地档案骨架。',
}

async function postArtistPrefetch(artist: string): Promise<ArtistPrefetchResult | null> {
  const response = await fetch('/api/prefetch-artist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artist }),
  })
  if (!response.ok) throw new Error('artist prefetch failed')
  return response.json() as Promise<ArtistPrefetchResult>
}

function anchorToSong(anchor: SongAnchor, fallback: Song): Song {
  return {
    ...fallback,
    id: typeof anchor.id === 'number' ? anchor.id : fallback.id,
    title: anchor.title,
    artist: anchor.artist,
    album: anchor.album,
    duration: anchor.duration ?? fallback.duration,
    coverUrl: anchor.coverUrl,
    playUrl: anchor.playUrl,
    tryUrl: anchor.tryUrl,
    qqMusicUrl: anchor.qqMusicUrl,
    source: anchor.source,
  }
}

function radioStepToSong(step: RadioStep, fallback: Song, index: number): Song {
  return {
    id: typeof step.id === 'number' ? step.id : 10_000 + index,
    chapter: step.chapter,
    title: step.title,
    artist: step.artist,
    duration: step.duration ?? fallback.duration,
    tags: fallback.tags,
    relatedArtists: [step.artist],
    stage: step.chapter,
    reason: step.reason ?? fallback.reason,
    tagColor: ['#C41E3A', '#C9A46A', '#7ECFD3', '#E7DCC1', '#F7C46B'][index] ?? '#C9A46A',
    coverUrl: step.coverUrl,
    playUrl: step.playUrl,
    tryUrl: step.tryUrl,
    qqMusicUrl: step.qqMusicUrl,
    source: step.source,
  }
}

export default function Home() {
  const reduceMotion = useReducedMotion()
  const [currentPage, setCurrentPage] = useState(0)
  const [concertInfo, setConcertInfo] = useState<ConcertInfo>(defaultConcertInfo)
  const [evidenceInputs, setEvidenceInputs] = useState<EvidenceInput[]>([])
  const [memoryProfile, setMemoryProfile] = useState<MemoryProfile>(() => analyzeMemory(defaultConcertInfo, []))
  const [analysisSource, setAnalysisSource] = useState<AnalysisSource>('rule')
  const [analysisMessage, setAnalysisMessage] = useState(defaultProviderStatus.description)
  const [analysisProvider] = useState<AnalysisProviderStatus>(defaultProviderStatus)
  const [localUser, setLocalUser] = useState<LocalUserIdentity | null>(null)
  const [qqMusicSession, setQQMusicSession] = useState<QQMusicUserSession | null>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [currentArchive, setCurrentArchive] = useState<ArchiveItem | null>(null)
  const [, setArtistCatalog] = useState<ArtistCatalogSessionState>({
    status: 'idle',
    requestArtist: '',
    result: null,
  })
  const artistPromiseRef = useRef<Promise<ArtistPrefetchResult | null>>(Promise.resolve(null))
  const pipeline = useMemoryPipeline()
  const totalPages = 11

  useEffect(() => {
    const identity = getOrCreateLocalUserIdentity()
    setLocalUser(identity)
    setCurrentArchive(loadLatestArchive({ userId: identity.id }))
  }, [])

  useEffect(() => {
    let active = true
    fetch('/api/qq-music/auth/session', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: { authenticated?: boolean; session?: QQMusicUserSession }) => {
        if (active && payload.authenticated && payload.session) {
          setQQMusicSession(payload.session)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setAuthChecking(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!pipeline.claim && !pipeline.radio && !pipeline.anchor) return
    setMemoryProfile((current) => {
      const playlist = pipeline.radio?.steps?.length
        ? pipeline.radio.steps.slice(0, 5).map((step, index) => radioStepToSong(step, current.playlist[index] ?? current.primarySong, index))
        : current.playlist
      const primarySong = pipeline.anchor
        ? anchorToSong(pipeline.anchor, playlist[0] ?? current.primarySong)
        : playlist[0] ?? current.primarySong
      return {
        ...current,
        lostItem: pipeline.claim?.lostItem ?? pipeline.multimodal?.lostItem ?? current.lostItem,
        foundLocation: pipeline.claim?.foundLocation ?? current.foundLocation,
        status: pipeline.claim?.status ?? current.status,
        custody: pipeline.claim?.custody ?? current.custody,
        note: pipeline.claim?.claimReason ?? pipeline.claim?.note ?? pipeline.multimodal?.claimReason ?? current.note,
        narrativeLines: pipeline.claim?.narrativeLines?.length ? pipeline.claim.narrativeLines : current.narrativeLines,
        dominantEmotion: pipeline.multimodal?.dominantEmotion
          ?? pipeline.multimodal?.emotionTags?.[0]
          ?? current.dominantEmotion,
        emotionTags: pipeline.claim?.emotionTags?.length
          ? pipeline.claim.emotionTags
          : pipeline.multimodal?.emotionTags?.length
            ? pipeline.multimodal.emotionTags
            : current.emotionTags,
        playlist,
        primarySong,
      }
    })
    const failures = Object.keys(pipeline.errors).length
    setAnalysisSource(failures ? 'fallback' : pipeline.readiness === 'all-ready' ? 'ai' : 'rule')
    setAnalysisMessage(failures
      ? `${failures} 项远程整理未完成，已用本地档案补齐。`
      : '画面、声音、文字与艺人曲库已完成联合整理。')
  }, [pipeline.anchor, pipeline.claim, pipeline.errors, pipeline.multimodal, pipeline.radio, pipeline.readiness])

  // Every screen shares the same phone scroller. Reset it on navigation so a
  // long previous screen cannot leave the next screen visually shifted upward.
  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>('.phone-scroll')
    if (scroller) {
      scroller.scrollTop = 0
      scroller.scrollLeft = 0
    }
  }, [currentPage])

  const goToPage = useCallback((page: number) => {
    setCurrentPage((current) => {
      if (page !== current) playSound('page')
      return Math.max(0, Math.min(page, totalPages - 1))
    })
  }, [])

  const goToNextPage = useCallback(() => {
    setCurrentPage((current) => {
      playSound('page')
      return Math.min(current + 1, totalPages - 1)
    })
  }, [])

  const handleConcertSubmit = (info: ConcertInfo) => {
    setConcertInfo(info)
    setMemoryProfile(analyzeMemory(info, evidenceInputs))
    goToNextPage()

    setArtistCatalog(startArtistPrefetch(info.artist))
    artistPromiseRef.current = postArtistPrefetch(info.artist)
      .then((result) => {
        if (result) setArtistCatalog((state) => finishArtistPrefetch(state, result))
        return result
      })
      .catch(() => null)
  }

  const handleEvidenceSubmit = (inputs: EvidenceInput[], media: EvidenceMediaBundle) => {
    setEvidenceInputs(inputs)
    const localProfile = analyzeMemory(concertInfo, inputs)
    setMemoryProfile(localProfile)
    setAnalysisSource('rule')
    setAnalysisMessage('正在联合整理线索，接口异常时将使用本地档案。')
    pipeline.startPipeline({
      concertInfo,
      evidences: inputs,
      media,
      localProfile,
      artistCatalog: artistPromiseRef.current,
    })
    goToPage(3)
  }

  const handleArchiveCurrentMemory = () => {
    const identity = localUser ?? getOrCreateLocalUserIdentity()
    if (!localUser) setLocalUser(identity)
    const archive = createArchiveItem(memoryProfile, { userId: identity.id, photoDataUrls: [] })
    const savedArchive = saveLatestArchive(archive)
    setCurrentArchive(savedArchive)
    goToNextPage()
  }

  const handleLogout = useCallback(async () => {
    setQQMusicSession(null)
    setCurrentPage(0)
    await fetch('/api/qq-music/auth/logout', { method: 'POST' }).catch(() => undefined)
  }, [])

  // After QQ Music login, start ambient BGM on the opening experience.
  useEffect(() => {
    if (!qqMusicSession || authChecking) return
    startBgm()
  }, [qqMusicSession, authChecking])

  if (authChecking) {
    return (
      <main className="grid h-dvh place-items-center bg-[#0D0D0D] text-[#C9A46A]">
        <div className="flex items-center gap-3 text-xs tracking-[0.2em]">
          <span className="h-4 w-4 animate-spin rounded-full border border-[#C9A46A]/20 border-t-[#C9A46A]" />
          正在确认音乐身份
        </div>
      </main>
    )
  }

  if (!qqMusicSession) {
    return <QQMusicLoginGate onAuthenticated={setQQMusicSession} />
  }

  return (
    <IPhoneMockup
      userMenu={<QQMusicUserMenu session={qqMusicSession} onLogout={handleLogout} />}
    >
      <AnimatePresence mode="wait">
        {currentPage === 0 && <OpeningScreen key="opening" onNext={goToNextPage} />}
        {currentPage === 1 && <MemoryCheckin key="checkin" onNext={handleConcertSubmit} />}
        {currentPage === 2 && <EvidenceCollection key="evidence" onNext={handleEvidenceSubmit} />}
        {currentPage === 3 && (
          <SearchingAnimation
            key="searching"
            onNext={() => goToPage(4)}
            readiness={pipeline.readiness}
            needsManualSong={pipeline.needsManualSong}
            identifyMessage={pipeline.identifyMessage}
            defaultArtist={concertInfo.artist}
            onResolveManualSong={pipeline.resolveManualSong}
            onSkipManualSong={pipeline.skipManualSong}
          />
        )}
        {currentPage === 4 && (
          <ListenFirstScreen
            key="listen-first"
            anchor={pipeline.anchor}
            readiness={pipeline.readiness}
            errorCount={Object.keys(pipeline.errors).length}
            onNext={() => goToPage(5)}
          />
        )}
        {currentPage === 5 && (
          <LostItemIdentification
            key="identification"
            profile={memoryProfile}
            concertInfo={concertInfo}
            claim={pipeline.claim}
            onNext={goToNextPage}
          />
        )}
        {currentPage === 6 && (
          <RecoveryRoute
            key="recovery"
            profile={memoryProfile}
            radio={pipeline.radio}
            analysisSource={analysisSource}
            analysisProvider={analysisProvider}
            onNext={goToNextPage}
          />
        )}
        {currentPage === 7 && <PlaybackScreen key="playback" profile={memoryProfile} radio={pipeline.radio} onNext={handleArchiveCurrentMemory} />}
        {currentPage === 8 && <MyLostCabinet key="cabinet" archiveItem={currentArchive} onNext={goToNextPage} />}
        {currentPage === 9 && <PublicLostWall key="wall" archiveItem={currentArchive} onNext={goToNextPage} />}
        {currentPage === 10 && <EndingScreen key="ending" archiveItem={currentArchive} profile={memoryProfile} />}
      </AnimatePresence>

      {!reduceMotion && (
        <AnimatePresence>
          <motion.div
            key={`page-transition-${currentPage}`}
            className="pointer-events-none fixed inset-0 z-[45] bg-archive-paper/10"
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: ['-100%', '0%', '100%'], opacity: [0, 1, 0] }}
            transition={{ duration: 0.62, ease: 'easeInOut' }}
          />
        </AnimatePresence>
      )}

      <nav aria-label="页面导航" className="fixed right-3 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-2.5">
        {Array.from({ length: totalPages }, (_, page) => (
          <button
            key={page}
            type="button"
            onClick={() => goToPage(page)}
            className={`no-btn-hover h-3 w-3 rounded-full ${currentPage === page ? 'scale-110 bg-archive-gold' : 'bg-archive-paper/35'}`}
            aria-label={`前往第 ${page + 1} 页`}
            aria-current={currentPage === page ? 'page' : undefined}
          />
        ))}
      </nav>
    </IPhoneMockup>
  )
}
