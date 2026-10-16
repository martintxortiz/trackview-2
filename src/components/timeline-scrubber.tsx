'use client'

import {
  memo,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react'
import {
  hoverSuppress,
  usePlayback,
  usePlaybackActions,
} from '@/components/playback-context'
import {
  HOVER_TIP_SPRING,
  REDUCED_TIP_TEXT_TRANSITION,
  TIP_APPEAR_TRANSITION,
  TIP_TEXT_TRANSITION,
  reducedTipTextVariants,
  tipTextVariants,
} from '@/lib/hover-tip-animation'
import {
  distanceRatioToTime,
  formatDelta,
  formatLapTime,
  LAP_DURATION_MS,
  SECTORS,
  sectorAccent,
  sectorAtRatio,
} from '@/lib/telemetry'
import type { TelemetryChartHandle } from '@/components/telemetry-chart'

type HoverTip =
  | { overBar: false; dir: number }
  | { overBar: true; name: string; delta: number; accent: string; dir: number }

/** Sector segments — memo so the 60fps playhead never re-renders them. */
const Segments = memo(function Segments({
  activeName,
  onHover,
  onLeave,
}: {
  activeName: string | null
  onHover: (clientX: number, clientY: number) => void
  onLeave: () => void
}) {
  return (
    <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-[2px]">
      {SECTORS.map((sector) => {
        const accent = sectorAccent(sector.delta)
        return (
          <button
            key={sector.name}
            type="button"
            className="relative h-full cursor-pointer rounded-none transition-colors duration-100 focus-visible:outline-none"
            style={{
              flex: sector.flex,
              backgroundColor:
                activeName === sector.name
                  ? accent
                  : 'color-mix(in srgb, var(--ink) 48%, transparent)',
            }}
            aria-label={`${sector.name}, ${formatDelta(sector.delta)}`}
            onFocus={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              onHover(rect.left + rect.width / 2, rect.top + rect.height / 2)
            }}
            onBlur={onLeave}
          />
        )
      })}
    </div>
  )
})

/** Vertical mark clipped to its parent. Parent height is the bound. */
function MarkLine({ at, dim = false }: { at: number; dim?: boolean }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-y-0 z-30 w-[2px] -translate-x-1/2 ${dim ? 'bg-foreground/20' : 'bg-foreground'}`}
      style={{ left: `${at * 100}%` }}
    />
  )
}

/** Timeline track on top of the chart. Lines stay inside the track only. */
function TimelineBar({
  barRef,
  activeName,
  onHover,
  onLeave,
}: {
  barRef: RefObject<HTMLDivElement | null>
  activeName: string | null
  onHover: (clientX: number, clientY: number) => void
  onLeave: () => void
}) {
  const { displayProgress, progress, isPreviewing } = usePlayback()
  return (
    <div
      ref={barRef}
      className="relative flex h-4.5 w-full items-center"
      role="slider"
      aria-valuenow={Math.round(displayProgress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Timeline"
    >
      <div className="relative h-2.5 w-full">
        <div className="absolute inset-0 overflow-hidden rounded-[2px]">
          <Segments activeName={activeName} onHover={onHover} onLeave={onLeave} />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 bg-card/70"
            style={{ width: `${(1 - displayProgress) * 100}%` }}
          />
          {isPreviewing ? <MarkLine at={progress} dim /> : null}
          <MarkLine at={displayProgress} />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 z-40 flex -translate-x-1/2 items-center"
          style={{ left: `${displayProgress * 100}%` }}
        >
          <div className="size-2 rounded-[2px] bg-foreground shadow-[0_0_0_2px_var(--card)]" />
        </div>
      </div>
    </div>
  )
}

/** Playhead inside the chart box only — the gap above stays empty. */
function ChartSlotLines() {
  const { displayProgress, progress, isPreviewing } = usePlayback()
  return (
    <>
      {isPreviewing ? <MarkLine at={progress} dim /> : null}
      <MarkLine at={displayProgress} />
    </>
  )
}

/** Pushes the true play position to the chart's dimmed ghost markers while
 *  previewing. Subscribes on its own so the scrubber shell never re-renders
 *  on tick; the chart updates imperatively (all series, all modes). */
function ChartPlaySync({
  chartRef,
  chartKey,
}: {
  chartRef: RefObject<TelemetryChartHandle | null>
  chartKey: ReactNode
}) {
  const { progress, isPreviewing } = usePlayback()
  useLayoutEffect(() => {
    chartRef.current?.setPlayRatio(isPreviewing ? progress : null)
  }, [chartRef, progress, isPreviewing, chartKey])
  return null
}

export function TimelineScrubber({
  children,
  chartRef,
  focusLocked = false,
}: {
  children: ReactNode
  chartRef?: RefObject<TelemetryChartHandle | null>
  focusLocked?: boolean
}) {
  // Stable actions only — this shell never re-renders on tick.
  const { seekRatio, setPreviewRatio } = usePlaybackActions()
  const [hoverTip, setHoverTip] = useState<HoverTip | null>(null)
  // Portal target exists only on the client — false during SSR/hydration.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  const scrubberRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const timeTextRef = useRef<HTMLSpanElement>(null)
  const pctTextRef = useRef<HTMLSpanElement>(null)
  const lastX = useRef<number | null>(null)
  const lastRatio = useRef(0)
  const tipHalf = useRef(40)
  const tipDir = useRef(1)
  const hoveringRef = useRef(false)
  const overChartRef = useRef(false)
  const scrubberLeftRef = useRef(0)
  const scrubberWidthRef = useRef(1)
  // Bar x-mapping — seek, hover and the chart share the track width.
  const barLeftRef = useRef(0)
  const barWidthRef = useRef(1)
  const reduceMotion = useReducedMotion()

  // Spring-smoothed tip follower — transform-only, settles and stops.
  const hoverX = useMotionValue(0)
  const smoothX = useSpring(hoverX, HOVER_TIP_SPRING)
  /** Viewport x clamped so the tip stays fully inside the scrubber edges. */
  const tipX = useTransform(smoothX, (x) => {
    const half = tipHalf.current
    const left = scrubberLeftRef.current
    const right = left + scrubberWidthRef.current
    if (scrubberWidthRef.current <= half * 2) return left + scrubberWidthRef.current / 2
    return Math.min(right - half, Math.max(left + half, x))
  })

  /** Direct-DOM text writes — no re-render while the cursor moves. */
  function writeText(ratio: number) {
    if (timeTextRef.current)
      timeTextRef.current.textContent = formatLapTime(
        distanceRatioToTime(ratio) * LAP_DURATION_MS,
      )
    if (pctTextRef.current)
      pctTextRef.current.textContent = `${Math.round(ratio * 100)}%`
  }

  function writeTextFromX(x: number) {
    const width = Math.max(1, barWidthRef.current)
    writeText(
      Math.min(1, Math.max(0, (x - barLeftRef.current) / width)),
    )
  }

  function updateHover(clientX: number, clientY?: number) {
    hoverSuppress.current = false
    const scrubber = scrubberRef.current
    const bar = barRef.current
    if (!scrubber || !bar) return
    const s = scrubber.getBoundingClientRect()
    const b = bar.getBoundingClientRect()
    const x = Math.min(s.right, Math.max(s.left, clientX))
    const bx = Math.min(b.right, Math.max(b.left, clientX))
    const ratio = Math.min(1, Math.max(0, (bx - b.left) / Math.max(1, b.width)))

    scrubberLeftRef.current = s.left
    scrubberWidthRef.current = s.width
    barLeftRef.current = b.left
    barWidthRef.current = b.width
    if (lastX.current == null) {
      hoverX.jump(x)
      smoothX.jump(x)
    } else if (x !== lastX.current) {
      tipDir.current = x > lastX.current ? 1 : -1
    }
    lastX.current = x
    lastRatio.current = ratio
    hoveringRef.current = true
    hoverX.set(x)
    writeText(ratio)
    const overBar = clientY != null && clientY >= b.top && clientY <= b.bottom
    const overChart = clientY != null && clientY > b.bottom
    overChartRef.current = overChart
    chartRef?.current?.setHoverRatio(ratio, overChart)
    setPreviewRatio(ratio)

    if (!overBar) {
      setHoverTip((prev) =>
        prev && !prev.overBar ? prev : { overBar: false, dir: tipDir.current },
      )
      return
    }
    const sector = sectorAtRatio(ratio)
    const accent = sectorAccent(sector.delta)
    setHoverTip((prev) =>
      prev?.overBar && prev.name === sector.name
        ? prev
        : {
            overBar: true,
            name: sector.name,
            delta: sector.delta,
            accent,
            dir: tipDir.current,
          },
    )
  }

  function clearHover() {
    if (focusLocked) return
    hoveringRef.current = false
    overChartRef.current = false
    lastX.current = null
    hoverSuppress.current = false
    chartRef?.current?.setHoverRatio(null)
    setPreviewRatio(null)
    setHoverTip(null)
  }

  function seekFromClientX(clientX: number, clientY?: number) {
    const bar = barRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    seekRatio(
      Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width))),
    )
    updateHover(clientX, clientY)
  }

  const tipKey = hoverTip ? (hoverTip.overBar ? hoverTip.name : 'progress') : null

  // Mode switches swap the series under a stuck cursor. Refresh the dots
  // and tip from the last ratio so the numbers match the chart on screen.
  useLayoutEffect(() => {
    const chart = chartRef?.current
    if (!chart) return
    chart.setHoverRatio(
      hoveringRef.current ? lastRatio.current : null,
      hoveringRef.current && overChartRef.current,
    )
  }, [children, chartRef])

  // Time/% text follows the tip while it glides — direct DOM writes only.
  useLayoutEffect(() => {
    const unsubscribe = smoothX.on('change', (x) => {
      if (!hoveringRef.current) return
      writeTextFromX(x)
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smoothX])

  // Re-measure + refill after the tip mounts or its content changes width.
  useLayoutEffect(() => {
    if (!hoverTip) return
    const tip = tipRef.current
    const bar = barRef.current
    if (tip) {
      tipHalf.current = Math.max(20, tip.offsetWidth / 2)
      if (bar) tip.style.top = `${bar.getBoundingClientRect().top - 3}px`
    }
    writeText(lastRatio.current)
    if (!tip || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      tipHalf.current = Math.max(20, tip.offsetWidth / 2)
    })
    observer.observe(tip)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipKey])

  return (
    <div
      ref={scrubberRef}
      className="relative flex flex-col gap-1 px-[2px]"
      onMouseMove={(e) => {
        if (hoverSuppress.current && e.movementX === 0 && e.movementY === 0) {
          return
        }
        updateHover(e.clientX, e.clientY)
        if (e.buttons === 1) seekFromClientX(e.clientX, e.clientY)
      }}
      onMouseLeave={clearHover}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        seekFromClientX(e.clientX, e.clientY)
      }}
    >
      <TimelineBar
        barRef={barRef}
        activeName={hoverTip?.overBar ? hoverTip.name : null}
        onHover={updateHover}
        onLeave={clearHover}
      />

      {children ? (
        <div className="relative cursor-crosshair overflow-hidden rounded-[4px]">
          {children}
          <ChartSlotLines />
        </div>
      ) : null}

      {chartRef ? <ChartPlaySync chartRef={chartRef} chartKey={children} /> : null}

      {mounted && hoverTip
        ? createPortal(
            <AnimatePresence>
              <motion.div
                key="hover-tip"
                ref={tipRef}
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.99, y: 1 }
                }
                animate={
                  reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
                }
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.99, y: 1 }
                }
                transition={TIP_APPEAR_TRANSITION}
                className="pointer-events-none fixed z-[9999] flex h-7 -translate-y-full items-center overflow-hidden rounded-[4px] bg-secondary px-2.5 text-sm font-medium text-foreground shadow-[var(--shadow-floating)]"
                style={{ left: tipX, x: '-50%' }}
              >
                <AnimatePresence
                  mode="popLayout"
                  custom={hoverTip.dir}
                  initial={false}
                >
                  <motion.div
                    key={tipKey}
                    custom={hoverTip.dir}
                    variants={
                      reduceMotion ? reducedTipTextVariants : tipTextVariants
                    }
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={
                      reduceMotion
                        ? REDUCED_TIP_TEXT_TRANSITION
                        : TIP_TEXT_TRANSITION
                    }
                    className="flex items-center gap-2 whitespace-nowrap"
                  >
                    {hoverTip.overBar ? (
                      <>
                        <span className="text-foreground/80">
                          {hoverTip.name}
                        </span>
                        <span
                          className="font-medium tracking-tight tabular-nums"
                          style={{ color: hoverTip.accent }}
                        >
                          {formatDelta(hoverTip.delta)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span
                          ref={timeTextRef}
                          className="text-foreground/80 tabular-nums"
                        />
                        <span
                          ref={pctTextRef}
                          className="font-medium tracking-tight text-muted-foreground tabular-nums"
                        />
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  )
}
