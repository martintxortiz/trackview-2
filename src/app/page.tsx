'use client'

import { useState } from 'react'
import {
  IconArrowAutofitHeight,
  IconArrowAutofitHeightFilled,
  IconArrowsMaximize,
  IconBellFilled,
  IconBroadcast,
  IconChevronDown,
  IconChevronLeft,
  IconKeyframesFilled,
  IconLayoutBottombarCollapse,
  IconLayoutBottombarCollapseFilled,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipBackFilled,
  IconPlayerSkipForwardFilled,
  IconPlayerTrackNextFilled,
  IconPlayerTrackPrevFilled,
  IconUserFilled,
} from '@tabler/icons-react'
import { Toolbar, ToolbarFrame, type ToolbarTab } from '@/components/toolbar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const TABS: ToolbarTab[] = [
  { id: 'telemetry', label: 'Overview' },
  { id: 'map', label: 'Laps' },
  { id: 'logs', label: 'Dynamics' },
  { id: 'usage', label: 'Usage' },
  { id: 'setup', label: 'Setup' },
  { id: 'coach', label: 'Coach' },
]

const CHART_TABS: ToolbarTab[] = [
  { id: 'diff', label: 'Difference' },
  { id: 'speed', label: 'Speed' },
  { id: 'throttle', label: 'Throttle' },
  { id: 'brake', label: 'Brake' },
]

const iconActionClass =
  'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--tv-fg-muted)] transition-colors hover:bg-[var(--tv-pill)] hover:text-[var(--tv-fg)]'

const liveActionBaseClass =
  'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 p-0 transition-colors'

export default function Page() {
  const [activeId, setActiveId] = useState('telemetry')
  const [chartTab, setChartTab] = useState('diff')
  const [isLive, setIsLive] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-between bg-[var(--tv-page)] p-1.5">
      <div className="flex w-full min-w-0 items-center gap-1">
        <ToolbarFrame className="shrink-0 gap-0.5">
          <button type="button" className={iconActionClass} aria-label="Back">
            <IconChevronLeft className="size-4 shrink-0" aria-hidden />
          </button>
          <button
            type="button"
            className={[
              liveActionBaseClass,
              isLive
                ? 'bg-[#e10600] text-white/80 hover:bg-[#e10600] hover:text-white'
                : 'bg-[#52525c] text-[var(--tv-fg-muted)] hover:bg-[#52525c] hover:text-[var(--tv-fg)]',
            ].join(' ')}
            aria-label={isLive ? 'Live' : 'Replay'}
            aria-pressed={isLive}
            onClick={() => setIsLive((live) => !live)}
          >
            {isLive ? (
              <IconBroadcast className="size-4" aria-hidden />
            ) : (
              <IconKeyframesFilled className="size-4" aria-hidden />
            )}
          </button>
        </ToolbarFrame>
        <ToolbarFrame className="min-w-0 flex-1">
          <Toolbar
            tabs={TABS}
            value={activeId}
            onValueChange={setActiveId}
          />
        </ToolbarFrame>
        <ToolbarFrame className="shrink-0 gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={iconActionClass}
              aria-label="More options"
            >
              <IconBellFilled className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Export data</DropdownMenuItem>
              <DropdownMenuItem>View documentation</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            className={iconActionClass}
            aria-label="Notifications"
          >
            <IconUserFilled className="size-4" aria-hidden />
          </button>
        </ToolbarFrame>
      </div>

      <div className="flex w-full flex-col gap-1.5 overflow-hidden rounded-2xl border border-[var(--tv-toolbar-border)] bg-[var(--tv-toolbar)] p-1">
        <div className="flex min-w-0 items-center gap-1">
          <Toolbar
            tabs={CHART_TABS}
            value={chartTab}
            onValueChange={setChartTab}
          />
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              className={iconActionClass}
              aria-label="Jump back"
            >
              <IconPlayerTrackPrevFilled className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              className={iconActionClass}
              aria-label="Step back"
            >
              <IconPlayerSkipBackFilled className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              className={iconActionClass}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              aria-pressed={isPlaying}
              onClick={() => setIsPlaying((playing) => !playing)}
            >
              {isPlaying ? (
                <IconPlayerPauseFilled className="size-4" aria-hidden />
              ) : (
                <IconPlayerPlayFilled className="size-4" aria-hidden />
              )}
            </button>
            <button
              type="button"
              className={iconActionClass}
              aria-label="Step forward"
            >
              <IconPlayerSkipForwardFilled className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              className={iconActionClass}
              aria-label="Jump forward"
            >
              <IconPlayerTrackNextFilled className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              className={iconActionClass}
              aria-label="Collapse"
            >
              <IconLayoutBottombarCollapseFilled className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              className={iconActionClass}
              aria-label="Fullscreen"
            >
              <IconArrowAutofitHeightFilled className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        <div className="flex h-60 items-center justify-center rounded-xl bg-[var(--tv-pill)] text-sm text-[var(--tv-fg-muted)]">          chart
        </div>
      </div>
    </div>
  )
}
