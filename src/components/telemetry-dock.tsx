'use client'

import { useRef, useState } from 'react'
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
import { usePlayback } from '@/components/playback-context'
import { Toolbar, type ToolbarTab } from '@/components/toolbar'
import { iconActionClass, toolbarIconClass } from '@/components/icon-action'
import { TimelineScrubber } from '@/components/timeline-scrubber'
import {
  TelemetryChart,
  type TelemetryChartHandle,
} from '@/components/telemetry-chart'

const CHART_TABS: ToolbarTab[] = [
  { id: 'diff', label: 'Delta' },
  { id: 'speed', label: 'Speed' },
  { id: 'throttle', label: 'Throttle' },
  { id: 'brake', label: 'Brake' },
]

function dockActionClass(active: boolean) {
  return [
    iconActionClass,
    active ? 'bg-secondary text-foreground hover:bg-secondary' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function TelemetryDock() {
  const [chartTab, setChartTab] = useState('diff')
  const [compact, setCompact] = useState(false)
  const [focusLocked, setFocusLocked] = useState(false)
  const chartRef = useRef<TelemetryChartHandle>(null)
  const {
    isPlaying,
    toggle,
    stepBack,
    stepForward,
    jumpBack,
    jumpForward,
  } = usePlayback()

  return (
    <div className="flex w-full flex-col gap-0.5 overflow-hidden rounded-[4px] border border-border bg-card p-0.5">
      <div className="grid w-full min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-1">
        <div className="min-w-0 justify-self-start">
          <Toolbar
            label="Chart"
            tabs={CHART_TABS}
            value={chartTab}
            onValueChange={setChartTab}
          />
        </div>
        <div className="flex items-center gap-0.5 justify-self-center">
          <button
            type="button"
            className={iconActionClass}
            aria-label="Jump back 1 second"
            onClick={jumpBack}
          >
            <IconPlayerTrackPrevFilled
              className={toolbarIconClass}
              aria-hidden
            />
          </button>
          <button
            type="button"
            className={iconActionClass}
            aria-label="Step back 100 milliseconds"
            onClick={stepBack}
          >
            <IconPlayerSkipBackFilled
              className={toolbarIconClass}
              aria-hidden
            />
          </button>
          <button
            type="button"
            className={iconActionClass}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            aria-pressed={isPlaying}
            onClick={toggle}
          >
            {isPlaying ? (
              <IconPlayerPauseFilled className={toolbarIconClass} aria-hidden />
            ) : (
              <IconPlayerPlayFilled className={toolbarIconClass} aria-hidden />
            )}
          </button>
          <button
            type="button"
            className={iconActionClass}
            aria-label="Step forward 100 milliseconds"
            onClick={stepForward}
          >
            <IconPlayerSkipForwardFilled
              className={toolbarIconClass}
              aria-hidden
            />
          </button>
          <button
            type="button"
            className={iconActionClass}
            aria-label="Jump forward 1 second"
            onClick={jumpForward}
          >
            <IconPlayerTrackNextFilled
              className={toolbarIconClass}
              aria-hidden
            />
          </button>
        </div>
        <div className="flex items-center gap-0.5 justify-self-end">
          <button
            type="button"
            className={dockActionClass(focusLocked)}
            aria-label="Focus lock"
            aria-pressed={focusLocked}
            onClick={() => setFocusLocked((locked) => !locked)}
          >
            <IconFocusCentered className={toolbarIconClass} aria-hidden />
          </button>
          <button
            type="button"
            className={dockActionClass(compact)}
            aria-label={compact ? 'Expand dock' : 'Compact dock'}
            aria-pressed={compact}
            onClick={() => setCompact((value) => !value)}
          >
            {compact ? (
              <IconLayoutBottombarExpandFilled
                className={toolbarIconClass}
                aria-hidden
              />
            ) : (
              <IconLayoutBottombarCollapseFilled
                className={toolbarIconClass}
                aria-hidden
              />
            )}
          </button>
          <button
            type="button"
            className={iconActionClass}
            aria-label="Dock settings"
          >
            <IconSettingsFilled className={toolbarIconClass} aria-hidden />
          </button>
        </div>
      </div>

      <TimelineScrubber chartRef={chartRef} focusLocked={focusLocked}>
        {compact ? null : <TelemetryChart ref={chartRef} />}
      </TimelineScrubber>
    </div>
  )
}
