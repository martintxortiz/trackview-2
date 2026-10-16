'use client'

/**
 * Lap-comparison shell — provider + scene + chrome.
 * Static map first (U06). Playback/scrubber deferred to U07 if product needs it.
 *
 * The spinner cover lives in shell-entry so it survives the dynamic chunk
 * mount; this file only fades the scene in and signals ready.
 */
import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { BackButton, BottomLeftControls, UserBar } from '@/features/lap-comparison/chrome'
import { ComparisonScene } from '@/features/lap-comparison/comparison-scene'
import {
  ComparisonProvider,
  useComparison,
  type Initial,
} from '@/features/lap-comparison/store'

/** Track fade-in under the dissolving cover. */
const SCENE_FADE_MS = 360

function ReadySignal({ onReady }: { onReady?: () => void }) {
  const { state } = useComparison()
  useEffect(() => {
    if (!state.isLoading) onReady?.()
  }, [state.isLoading, onReady])
  return null
}

function ShellBody({
  className,
  style,
  children,
}: {
  className?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  const { state } = useComparison()
  return (
    <div className={className ?? 'absolute inset-0'} style={style}>
      <div
        className={`absolute inset-0 transition-opacity ease-out motion-reduce:transition-none ${state.isLoading ? 'opacity-0' : 'opacity-100'}`}
        style={{ transitionDuration: `${SCENE_FADE_MS}ms` }}
      >
        <ComparisonScene />
      </div>
      <BackButton />
      <UserBar />
      <BottomLeftControls />
      {children}
    </div>
  )
}

/**
 * Drop-in lap-comparison shell. Fills its parent.
 * Route: `/dashboard/lap-comparison`.
 */
export function LapComparisonShell({
  className,
  style,
  initial,
  onReady,
  children,
}: {
  className?: string
  style?: CSSProperties
  /** Kept for route parity with old DashboardShell; ignored (no debug panels). */
  controls?: boolean
  initial?: Initial
  /** Fires once when the cover may dissolve (scene is ready underneath). */
  onReady?: () => void
  children?: ReactNode
}) {
  return (
    <ComparisonProvider initial={initial}>
      <ReadySignal onReady={onReady} />
      <ShellBody className={className} style={style}>
        {children}
      </ShellBody>
    </ComparisonProvider>
  )
}
