'use client'

import { useMemo, useRef, useState } from 'react'
import {
  IconFocusCentered,
  IconLayoutBottombarCollapseFilled,
  IconLayoutBottombarExpandFilled,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipBackFilled,
  IconPlayerSkipForwardFilled,
  IconPlayerTrackNextFilled,
  IconPlayerTrackPrevFilled,
  IconSettingsFilled,
} from '@tabler/icons-react'
import { useMapFocus } from '@/components/map-focus'
import {
  usePlayback,
  usePlaybackActions,
  usePlaybackRate,
} from '@/components/playback-context'
import { Toolbar, type ToolbarTab } from '@/components/toolbar'
import { IconButton, iconButtonClass, iconClass } from '@/components/icon-button'
import { TimelineScrubber } from '@/components/timeline-scrubber'
import {
  TelemetryChart,
  type ChartMode,
  type TelemetryChartHandle,
} from '@/components/telemetry-chart'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  formatPlaybackRate,
  PLAYBACK_RATES,
  type PlaybackRate,
} from '@/lib/telemetry'

const CHART_TABS: ToolbarTab[] = [
  { id: 'diff', label: 'Delta' },
  { id: 'speed', label: 'Speed' },
  { id: 'throttle', label: 'Throttle' },
  { id: 'brake', label: 'Brake' },
]

const isChartMode = (id: string): id is ChartMode =>
  id === 'diff' || id === 'speed' || id === 'throttle' || id === 'brake'

/** Only transport subscriber — the dock shell never re-renders on tick. */
function TransportControls() {
  const { isPlaying } = usePlayback()
  const { toggle, stepBack, stepForward, jumpBack, jumpForward } =
    usePlaybackActions()

  const buttons = [
    { key: 'jump-back', label: 'Jump back 1 second', onClick: jumpBack, Icon: IconPlayerTrackPrevFilled },
    { key: 'step-back', label: 'Step back 100 milliseconds', onClick: stepBack, Icon: IconPlayerSkipBackFilled },
    {
      key: 'play-pause',
      label: isPlaying ? 'Pause' : 'Play',
      onClick: toggle,
      Icon: isPlaying ? IconPlayerPauseFilled : IconPlayerPlayFilled,
      pressed: isPlaying,
    },
    { key: 'step-forward', label: 'Step forward 100 milliseconds', onClick: stepForward, Icon: IconPlayerSkipForwardFilled },
    { key: 'jump-forward', label: 'Jump forward 1 second', onClick: jumpForward, Icon: IconPlayerTrackNextFilled },
  ]

  return (
    <div className="flex items-center gap-0.5 justify-self-center">
      {buttons.map(({ key, label, onClick, Icon, pressed }) => (
        <IconButton
          key={key}
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
        >
          <Icon className={iconClass} aria-hidden />
        </IconButton>
      ))}
    </div>
  )
}

/** Playback rate — own subscriber so the dock shell stays off the rAF path. */
function PlaybackRateControl() {
  const playbackRate = usePlaybackRate()
  const { setPlaybackRate } = usePlaybackActions()
  const active = playbackRate !== 1

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Playback speed ${formatPlaybackRate(playbackRate)}`}
        className={[
          iconButtonClass,
          'min-w-7 px-1 text-[11px] font-medium tabular-nums tracking-tight',
          active
            ? 'bg-secondary text-foreground hover:bg-secondary'
            : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
        ].join(' ')}
      >
        {formatPlaybackRate(playbackRate)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-24">
        {PLAYBACK_RATES.map((rate) => (
          <DropdownMenuItem
            key={rate}
            onClick={() => setPlaybackRate(rate as PlaybackRate)}
            className={
              rate === playbackRate ? 'bg-accent text-accent-foreground' : ''
            }
          >
            {formatPlaybackRate(rate)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TelemetryDock() {
  const [chartTab, setChartTab] = useState<ChartMode>('diff')
  const [compact, setCompact] = useState(false)
  const { locked: focusLocked, toggle: toggleFocus } = useMapFocus()
  const chartRef = useRef<TelemetryChartHandle>(null)
  // Stable element identity — TimelineScrubber refreshes the chart dots/tip
  // and re-syncs the play markers whenever its `children` identity changes,
  // so a fresh element on every dock render (e.g. focus toggle) means
  // redundant imperative pokes that can hide visible dots for a frame.
  const chart = useMemo(
    () => (compact ? null : <TelemetryChart ref={chartRef} mode={chartTab} />),
    [compact, chartTab],
  )

  return (
    <div className="relative flex w-full flex-col gap-0.5 overflow-hidden rounded-[4px] border border-border bg-card p-0.5">
      <div className="grid w-full min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-1">
        <div className="min-w-0 justify-self-start">
          <Toolbar
            label="Chart"
            tabs={CHART_TABS}
            value={chartTab}
            onValueChange={(id) => {
              if (isChartMode(id)) setChartTab(id)
            }}
          />
        </div>
        <TransportControls />
        <div className="flex items-center gap-0.5 justify-self-end">
          <PlaybackRateControl />
          <IconButton
            aria-label="Focus on car"
            aria-pressed={focusLocked}
            active={focusLocked}
            onClick={toggleFocus}
          >
            <IconFocusCentered
              className={
                focusLocked
                  ? `${iconClass} [&_path:nth-of-type(2)]:fill-current`
                  : iconClass
              }
              aria-hidden
            />
          </IconButton>
          <IconButton
            aria-label={compact ? 'Expand dock' : 'Compact dock'}
            aria-pressed={compact}
            active={compact}
            onClick={() => setCompact((value) => !value)}
          >
            {compact ? (
              <IconLayoutBottombarExpandFilled className={iconClass} aria-hidden />
            ) : (
              <IconLayoutBottombarCollapseFilled className={iconClass} aria-hidden />
            )}
          </IconButton>
          <IconButton aria-label="Dock settings">
            <IconSettingsFilled className={iconClass} aria-hidden />
          </IconButton>
        </div>
      </div>

      <TimelineScrubber chartRef={chartRef} focusLocked={focusLocked}>
        {chart}
      </TimelineScrubber>
    </div>
  )
}
