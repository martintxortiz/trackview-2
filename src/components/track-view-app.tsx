'use client'

import { PlaybackProvider, usePlayback } from '@/components/playback-context'
import { TopBar } from '@/components/top-bar'
import { TelemetryDock } from '@/components/telemetry-dock'

function PlaybackDebug() {
  const { displayProgress, displayTimeMs, isPlaying, isPreviewing } =
    usePlayback()

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center pt-6">
      <span className="text-4xl font-medium tracking-tight text-foreground/80 tabular-nums">
        {Math.round(displayProgress * 100)}%
      </span>
      <span className="mt-1 text-sm text-muted-foreground tabular-nums">
        {(displayTimeMs / 1000).toFixed(3)}s ·{' '}
        {isPreviewing ? 'preview' : isPlaying ? 'playing' : 'paused'}
      </span>
    </div>
  )
}

export function TrackViewApp() {
  return (
    <PlaybackProvider>
      <div className="flex h-screen w-screen flex-col gap-2 bg-background p-1">
        <TopBar />
        <PlaybackDebug />
        <TelemetryDock />
      </div>
    </PlaybackProvider>
  )
}
