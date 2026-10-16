'use client'

/**
 * Client-only entry for the lap-comparison route.
 * `ssr: false` must live in a Client Component (R3F + track loaders).
 *
 * One loader instance lives here for the whole wait — including the dynamic
 * chunk swap — so the Blocks animation never remounts / restarts.
 */
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import { Blocks } from 'loading-dev'
import type { Initial } from '@/features/lap-comparison/store'

const LOADER_FADE_MS = 280

const LapComparisonShellNoSSR = dynamic(
  () => import('@/features/lap-comparison/shell').then((m) => m.LapComparisonShell),
  { ssr: false, loading: () => null },
)

function EntryLoader({ visible }: { visible: boolean }) {
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (visible) {
      setGone(false)
      return
    }
    const t = setTimeout(() => setGone(true), LOADER_FADE_MS)
    return () => clearTimeout(t)
  }, [visible])

  if (gone) return null
  return (
    <div
      className={`absolute inset-0 z-30 flex items-center justify-center bg-background text-foreground transition-opacity ease-out motion-reduce:transition-none ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      style={{ transitionDuration: `${LOADER_FADE_MS}ms` }}
      aria-hidden
    >
      <Blocks size={24} className="opacity-40" />
    </div>
  )
}

export function LapComparisonShellEntry({
  controls = false,
  initial,
}: {
  controls?: boolean
  initial?: Initial
}) {
  const [covered, setCovered] = useState(true)
  const onReady = useCallback(() => setCovered(false), [])

  return (
    <div className="absolute inset-0">
      <LapComparisonShellNoSSR
        controls={controls}
        initial={{ loading: true, ...initial }}
        onReady={onReady}
      />
      <EntryLoader visible={covered} />
    </div>
  )
}
