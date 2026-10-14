'use client'

import {
  useEffect,
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
import { usePlayback } from '@/components/playback-context'
import {
  formatDelta,
  formatLapTime,
  LAP_DURATION_MS,
  SECTORS,
  sectorAccent,
  sectorAtRatio,
} from '@/lib/telemetry'
import type { TelemetryChartHandle } from '@/components/telemetry-chart'

type HoverTip = {
  overBar: boolean
  name: string
  delta: number
  accent: string
  dir: number
}

const tipTextVariants = {
  enter: (dir: number) => ({
    x: dir * 28,
    opacity: 0,
    filter: 'blur(8px)',
  }),
  center: {
    x: 0,
    opacity: 1,
    filter: 'blur(0px)',
  },
  exit: (dir: number) => ({
    x: dir * -28,
    opacity: 0,
    filter: 'blur(8px)',
  }),
}

const reducedTipTextVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
}

function subscribeClient() {
  return () => {}
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
  const {
    displayProgress,
    seekRatio,
    setPreviewRatio,
    previewGeneration,
  } = usePlayback()
  const reduceMotion = useReducedMotion()
  const overlayReady = useSyncExternalStore(
    subscribeClient,
    () => true,
    () => false,
  )
  const [hoverTip, setHoverTip] = useState<HoverTip | null>(null)
  const [trackWidth, setTrackWidth] = useState(1)
  const [dotTop, setDotTop] = useState(0)

  const timelineRef = useRef<HTMLDivElement>(null)
  const scrubberRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const timeTextRef = useRef<HTMLSpanElement>(null)
  const pctTextRef = useRef<HTMLSpanElement>(null)
  const lastHoverX = useRef<number | null>(null)
  const tipDir = useRef(1)
  const hoveringRef = useRef(false)
  const suppressUntilMoveRef = useRef(false)
  const scrubberLeftRef = useRef(0)
  const scrubberRightRef = useRef(0)
  const timelineLeftRef = useRef(0)
  const timelineWidthRef = useRef(1)
  const timelineTopRef = useRef(0)
  const timelineBottomRef = useRef(0)
  const tipHalfRef = useRef(48)
  const tipEdgePad = 6

  const hoverX = useMotionValue(0)
  /** OA CHART spring — crosshair / tip follower. */
  const smoothX = useSpring(hoverX, {
    stiffness: 300,
    damping: 28,
    mass: 0.2,
  })
  const tipX = useTransform(smoothX, (x) => {
    const half = tipHalfRef.current
    const min = scrubberLeftRef.current + half + tipEdgePad
    const max = scrubberRightRef.current - half - tipEdgePad
    if (max <= min) {
      return (scrubberLeftRef.current + scrubberRightRef.current) / 2
    }
    return Math.min(max, Math.max(min, x))
  })

  function syncTipHalf() {
    const tip = tipRef.current
    if (!tip) return
    const next = Math.max(24, tip.offsetWidth / 2)
    if (Math.abs(next - tipHalfRef.current) < 0.5) return
    tipHalfRef.current = next
    // Re-clamp tipX now that the measured width changed.
    const x = hoverX.get()
    hoverX.jump(x)
    smoothX.jump(x)
  }

  function measureLayout() {
    const scrubber = scrubberRef.current
    const bar = timelineRef.current
    if (!scrubber || !bar) return
    const scrubberRect = scrubber.getBoundingClientRect()
    const barRect = bar.getBoundingClientRect()
    scrubberLeftRef.current = scrubberRect.left
    scrubberRightRef.current = scrubberRect.right
    timelineLeftRef.current = barRect.left
    timelineWidthRef.current = barRect.width
    timelineTopRef.current = barRect.top
    timelineBottomRef.current = barRect.bottom
    setTrackWidth(Math.max(1, scrubberRect.width))
    setDotTop(barRect.top + barRect.height / 2 - scrubberRect.top)
  }

  function ratioFromClientX(clientX: number) {
    const scrubber = scrubberRef.current
    if (!scrubber) return null
    const rect = scrubber.getBoundingClientRect()
    const width = Math.max(1, rect.width)
    return Math.min(1, Math.max(0, (clientX - rect.left) / width))
  }

  function writeProgress(x: number) {
    const left = scrubberLeftRef.current
    const width = Math.max(1, scrubberRightRef.current - left)
    const ratio = Math.min(1, Math.max(0, (x - left) / width))
    const pct = ratio * 100
    if (timeTextRef.current) {
      timeTextRef.current.textContent = formatLapTime(ratio * LAP_DURATION_MS)
    }
    if (pctTextRef.current) {
      pctTextRef.current.textContent = `${Math.round(pct)}%`
    }
  }

  function writeCurveDots(ratio: number) {
    chartRef?.current?.setHoverRatio(ratio)
  }

  function syncGeometry(clientX: number) {
    const scrubber = scrubberRef.current
    const bar = timelineRef.current
    if (!scrubber || !bar) return null
    const scrubberRect = scrubber.getBoundingClientRect()
    const barRect = bar.getBoundingClientRect()
    const x = Math.min(scrubberRect.right, Math.max(scrubberRect.left, clientX))
    scrubberLeftRef.current = scrubberRect.left
    scrubberRightRef.current = scrubberRect.right
    timelineLeftRef.current = barRect.left
    timelineWidthRef.current = barRect.width
    timelineTopRef.current = barRect.top
    timelineBottomRef.current = barRect.bottom
    return { x, barRect }
  }

  function clearHoverUi() {
    lastHoverX.current = null
    hoveringRef.current = false
    chartRef?.current?.setHoverRatio(null)
    setHoverTip(null)
  }

  function clearHover() {
    if (focusLocked) return
    clearHoverUi()
    suppressUntilMoveRef.current = false
    setPreviewRatio(null)
  }

  function updateHover(clientX: number, clientY?: number) {
    if (suppressUntilMoveRef.current) {
      suppressUntilMoveRef.current = false
    }

    const geometry = syncGeometry(clientX)
    if (!geometry) return
    const { x, barRect } = geometry
    const ratio = ratioFromClientX(clientX)
    if (ratio == null) return

    if (lastHoverX.current == null) {
      hoverX.jump(x)
      smoothX.jump(x)
    } else if (x !== lastHoverX.current) {
      tipDir.current = x > lastHoverX.current ? 1 : -1
    }
    lastHoverX.current = x
    hoveringRef.current = true
    hoverX.set(x)
    writeProgress(x)
    writeCurveDots(ratio)
    setPreviewRatio(ratio)

    const overBar =
      clientY != null &&
      clientY >= barRect.top &&
      clientY <= barRect.bottom

    const sector = sectorAtRatio(
      (x - barRect.left) / Math.max(1, barRect.width),
    )
    const next: HoverTip = {
      overBar,
      name: sector.name,
      delta: sector.delta,
      accent: sectorAccent(sector.delta),
      dir: tipDir.current,
    }
    setHoverTip((prev) => {
      if (
        prev &&
        prev.overBar === next.overBar &&
        prev.name === next.name &&
        prev.delta === next.delta &&
        prev.accent === next.accent
      ) {
        return prev
      }
      return next
    })
  }

  function seekFromClientX(clientX: number, clientY?: number) {
    const ratio = ratioFromClientX(clientX)
    if (ratio == null) return
    suppressUntilMoveRef.current = false
    seekRatio(ratio)
    updateHover(clientX, clientY)
  }

  useEffect(() => {
    if (previewGeneration === 0) return
    suppressUntilMoveRef.current = true
    clearHoverUi()
  }, [previewGeneration])

  useLayoutEffect(() => {
    measureLayout()
    const scrubber = scrubberRef.current
    if (!scrubber) return
    const observer = new ResizeObserver(() => measureLayout())
    observer.observe(scrubber)
    window.addEventListener('resize', measureLayout)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measureLayout)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = smoothX.on('change', (x) => {
      if (!hoveringRef.current) return
      writeProgress(x)
    })
    return unsubscribe
  }, [smoothX])

  const playheadLeft = displayProgress * trackWidth
  const tipKey = hoverTip
    ? hoverTip.overBar
      ? `sector-${hoverTip.name}`
      : 'progress'
    : null

  useLayoutEffect(() => {
    if (!hoverTip) return
    const tip = tipRef.current
    if (tip) {
      tip.style.top = `${timelineTopRef.current - 4}px`
      syncTipHalf()
    }
    writeProgress(hoverX.get())

    if (!tip || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      tip.style.top = `${timelineTopRef.current - 4}px`
      syncTipHalf()
    })
    observer.observe(tip)
    return () => observer.disconnect()
  }, [hoverTip, tipKey, hoverX, smoothX])

  return (
    <div
      ref={scrubberRef}
      className="relative flex flex-col gap-1"
      onMouseMove={(e) => {
        if (suppressUntilMoveRef.current && e.movementX === 0 && e.movementY === 0) {
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
      <div
        ref={timelineRef}
        className="relative flex h-3 w-full items-center overflow-hidden"
        role="slider"
        aria-valuenow={Math.round(displayProgress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Timeline"
      >
        <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-[2px]">
          {SECTORS.map((sector) => {
            const accent = sectorAccent(sector.delta)
            const active = hoverTip?.overBar && hoverTip.name === sector.name
            return (
              <button
                key={sector.name}
                type="button"
                className="relative h-full cursor-pointer rounded-none transition-colors duration-100 focus-visible:outline-none"
                style={{
                  flex: sector.flex,
                  backgroundColor: active
                    ? accent
                    : 'color-mix(in srgb, var(--ink) 48%, transparent)',
                }}
                aria-label={`${sector.name}, ${formatDelta(sector.delta)}`}
                onFocus={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  updateHover(
                    rect.left + rect.width / 2,
                    rect.top + rect.height / 2,
                  )
                }}
                onBlur={clearHover}
              />
            )
          })}
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 right-0 bg-card/70"
          style={{ width: `${(1 - displayProgress) * 100}%` }}
        />
      </div>

      {children ? (
        <div className="relative cursor-crosshair overflow-hidden">
          {children}
        </div>
      ) : null}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 z-10 w-[2px] bg-white"
        style={{ left: playheadLeft, transform: 'translateX(-50%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute z-[11] size-2 -translate-x-1/2 -translate-y-1/2 rounded-[2px] bg-white shadow-[0_0_0_2px_var(--card)]"
        style={{ left: playheadLeft, top: dotTop }}
      />

      {overlayReady
        ? createPortal(
            <AnimatePresence>
              {hoverTip ? (
                <motion.div
                  key="hover-tip"
                  ref={tipRef}
                  initial={
                    reduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.99, y: 1 }
                  }
                  animate={
                    reduceMotion
                      ? { opacity: 1 }
                      : { opacity: 1, scale: 1, y: 0 }
                  }
                  exit={
                    reduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.99, y: 1 }
                  }
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                  className="pointer-events-none fixed z-[9999] -translate-y-full overflow-hidden rounded-[4px] border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground shadow-[var(--shadow-floating)]"
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
                      transition={{
                        duration: reduceMotion ? 0 : 0.16,
                        ease: 'easeOut',
                      }}
                      className="flex items-center gap-2 whitespace-nowrap"
                    >
                      {hoverTip.overBar ? (
                        <>
                          <span className="tracking-wide text-foreground">
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
                            className="tracking-wide text-foreground tabular-nums"
                          />
                          <span
                            ref={pctTextRef}
                            className="font-medium tracking-tight text-foreground/70 tabular-nums"
                          />
                        </>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  )
}
