'use client'

import dynamic from 'next/dynamic'
import { MapFocusProvider } from '@/components/map-focus'
import { PlaybackProvider } from '@/components/playback-context'
import { TopBar } from '@/components/top-bar'
import { TelemetryDock } from '@/components/telemetry-dock'
import { spa, spaRace } from '@/track/spa'

const TrackCanvas = dynamic(
  () => import('@/components/track-canvas').then((m) => m.TrackCanvas),
  { ssr: false, loading: () => <div className="absolute inset-0" /> },
)

const RACING_LINE_COLOR = '#349cff'

const LINES = [
  { id: 'racing-line', points: spaRace, color: RACING_LINE_COLOR },
] as const

// KEEP: deprecated root view, do not remove on optimization passes. Kept for
// reference in case the dashboard blocks need it. Unrouted since page.tsx
// was removed.
export function DeprecatedTrackViewApp() {
  return (
    <PlaybackProvider>
      <MapFocusProvider>
        <div className="relative h-screen w-screen overflow-hidden bg-background">
          <TrackCanvas track={spa} lines={LINES} />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-1">
            <div className="pointer-events-auto" data-tv-chrome>
              <TopBar />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-1">
            <div className="pointer-events-auto" data-tv-chrome>
              <TelemetryDock />
            </div>
          </div>
        </div>
      </MapFocusProvider>
    </PlaybackProvider>
  )
}
