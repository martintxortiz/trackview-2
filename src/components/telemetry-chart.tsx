'use client'

import {
  forwardRef,
  memo,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsType } from 'echarts'
import {
  CHART_BRAKE_A,
  CHART_BRAKE_B,
  CHART_DELTA,
  CHART_DELTA_TICKS,
  CHART_POINT_COUNT,
  CHART_SERIES_A,
  CHART_SERIES_B,
  CHART_THROTTLE_A,
  CHART_THROTTLE_B,
  sampleSeries,
  SERIES_A_COLOR,
  SERIES_B_COLOR,
} from '@/lib/telemetry'

export type ChartMode = 'diff' | 'speed' | 'throttle' | 'brake'

export type TelemetryChartHandle = {
  setHoverRatio: (ratio: number | null, overChart?: boolean) => void
  /** Dimmed true-playback marker shown on every series while previewing. */
  setPlayRatio: (ratio: number | null) => void
}

const X_MAX = CHART_POINT_COUNT - 1
const toPairs = (data: readonly number[]) =>
  data.map((y, i) => [i, y] as [number, number])

type ModeConfig = {
  ticks: readonly number[]
  formatTick: (value: number) => string
  unit: string
  pairs: [number, number][][]
  colors: string[]
  values: readonly number[][]
}

/**
 * Five evenly spaced ticks, always at 10/30/50/70/90% of the plot.
 * Same slots in every mode so the rows do not jump on tab change.
 * 10% of pad above the top tick and below the bottom one.
 */
function axisForTicks(ticks: readonly number[]) {
  const lo = Math.min(...ticks)
  const hi = Math.max(...ticks)
  const span = (hi - lo) / 0.8
  return { yMin: lo - span * 0.1, yMax: hi + span * 0.1 }
}

const intTick = (value: number) => `${Math.round(value)}`

const MODES: Record<ChartMode, ModeConfig> = {
  speed: {
    // Same 50–350 scale as before; labels sit on the shared rows.
    ticks: [80, 140, 200, 260, 320],
    formatTick: intTick,
    unit: 'kph',
    pairs: [toPairs(CHART_SERIES_A), toPairs(CHART_SERIES_B)],
    colors: [SERIES_A_COLOR, SERIES_B_COLOR],
    values: [CHART_SERIES_A, CHART_SERIES_B],
  },
  throttle: {
    ticks: [0, 25, 50, 75, 100],
    formatTick: intTick,
    unit: '%',
    pairs: [toPairs(CHART_THROTTLE_A), toPairs(CHART_THROTTLE_B)],
    colors: [SERIES_A_COLOR, SERIES_B_COLOR],
    values: [CHART_THROTTLE_A, CHART_THROTTLE_B],
  },
  brake: {
    ticks: [0, 25, 50, 75, 100],
    formatTick: intTick,
    unit: '%',
    pairs: [toPairs(CHART_BRAKE_A), toPairs(CHART_BRAKE_B)],
    colors: [SERIES_A_COLOR, SERIES_B_COLOR],
    values: [CHART_BRAKE_A, CHART_BRAKE_B],
  },
  diff: {
    ticks: CHART_DELTA_TICKS,
    formatTick: (value: number) => value.toFixed(2),
    unit: 's',
    pairs: [toPairs(CHART_DELTA)],
    colors: [SERIES_B_COLOR],
    values: [CHART_DELTA],
  },
}

type ChartTipHandle = {
  setTip: (x: number | null, y: number | null, texts: string[]) => void
}

/**
 * Chart hover tip. Always mounted, positioned imperatively so it tracks the
 * dot instantly. Only the number swap animates. State holds texts alone so
 * the ECharts instance never re-renders on mousemove.
 */
const ChartTip = forwardRef<
  ChartTipHandle,
  { colors: string[]; unit: string; wrapRef: RefObject<HTMLDivElement | null> }
>(function ChartTip({ colors, unit, wrapRef }, ref) {
  const [texts, setTexts] = useState<string[]>(() => colors.map(() => ''))
  const tipNodeRef = useRef<HTMLDivElement | null>(null)
  const sizeRef = useRef({ w: 0, h: 0 })

  useImperativeHandle(
    ref,
    () => ({
      setTip(x, y, next) {
        const node = tipNodeRef.current
        const wrap = wrapRef.current
        if (!node || !wrap) return
        if (x == null || y == null) {
          node.style.opacity = '0'
          return
        }
        const wrapW = Math.max(1, wrap.clientWidth)
        const wrapH = Math.max(1, wrap.clientHeight)
        const { w, h } = sizeRef.current
        const GAP = 10
        let left = x + GAP
        if (w > 0 && left + w > wrapW) left = Math.max(4, x - GAP - w)
        const top = Math.min(
          Math.max(4, y - h / 2),
          Math.max(4, wrapH - h - 4),
        )
        node.style.transform = `translate3d(${left}px, ${top}px, 0)`
        node.style.opacity = '1'
        setTexts((prev) =>
          prev.length === next.length &&
          prev.every((text, index) => text === next[index])
            ? prev
            : [...next],
        )
      },
    }),
    [wrapRef],
  )

  useLayoutEffect(() => {
    const node = tipNodeRef.current
    if (!node) return
    const measure = () => {
      sizeRef.current = { w: node.offsetWidth, h: node.offsetHeight }
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={tipNodeRef}
      aria-hidden
      className="absolute top-0 left-0 z-50 flex items-center rounded-[4px] bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground opacity-0 shadow-[var(--shadow-floating)] will-change-transform"
    >
      <div className="flex flex-col items-start gap-1 whitespace-nowrap">
        {colors.map((color, index) => (
          <span key={index} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-[2px]"
              style={{ backgroundColor: color }}
            />
            <span className="text-foreground/80 tabular-nums">
              {texts[index]}
            </span>
            <span className="font-medium tracking-tight text-muted-foreground tabular-nums">
              {unit}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
})

const TelemetryChartInner = forwardRef<
  TelemetryChartHandle,
  { mode: ChartMode }
>(function TelemetryChartInner({ mode }, ref) {
  const config = MODES[mode]
  const axis = axisForTicks(config.ticks)
  const levels = [...config.ticks].sort((a, b) => b - a)
  const chartApiRef = useRef<EChartsType | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const dotRefs = useRef<(HTMLDivElement | null)[]>([])
  const playDotRefs = useRef<(HTMLDivElement | null)[]>([])
  const playRatioRef = useRef<number | null>(null)
  const tipApiRef = useRef<ChartTipHandle | null>(null)
  // One-shot mount animation only — no per-frame cost (series are silent).
  const [animate] = useState(
    () =>
      typeof window === 'undefined' ||
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  // Stable identity — ReactECharts re-applies a fresh option object with
  // notMerge (replaying the entrance animation and dropping hover/play dot
  // state), so it must only change when the data actually changes.
  const option = useMemo(
    () => ({
      animation: animate,
      animationDuration: 450,
      animationDurationUpdate: 0,
      animationEasing: 'cubicOut',
      backgroundColor: 'transparent',
      // Full-bleed plot: both series start on the left edge, in line
      // with the timeline. outerBoundsMode none keeps that inset fixed.
      grid: {
        left: 0,
        right: 0,
        top: 8,
        bottom: 8,
        containLabel: false,
        outerBoundsMode: 'none',
      },
      xAxis: {
        type: 'value' as const,
        min: 0,
        max: X_MAX,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        min: axis.yMin,
        max: axis.yMax,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      series: config.pairs.map((data, index) => ({
        type: 'line' as const,
        silent: true,
        data,
        showSymbol: false,
        emphasis: { disabled: true },
        lineStyle: { color: config.colors[index], width: 2 },
      })),
    }),
    [animate, axis.yMax, axis.yMin, config],
  )

  const applyPlayRatio = (ratio: number | null) => {
    playRatioRef.current = ratio
    if (ratio == null) {
      for (const el of playDotRefs.current) {
        if (el) el.style.opacity = '0'
      }
      return
    }
    const chart = chartApiRef.current
    const wrap = wrapRef.current
    if (!chart || !wrap) return
    const x = ratio * X_MAX
    // Full-bleed plot: x is the chart width, same mapping as the timeline.
    const pixelX = ratio * wrap.clientWidth
    config.values.forEach((values, index) => {
      const el = playDotRefs.current[index]
      if (!el) return
      const pixel = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [
        x,
        sampleSeries(values, ratio),
      ])
      if (!Array.isArray(pixel)) {
        el.style.opacity = '0'
        return
      }
      el.style.transform = `translate3d(${pixelX}px, ${pixel[1]}px, 0) translate(-50%, -50%)`
      el.style.opacity = '0.35'
    })
  }

  useImperativeHandle(ref, () => ({
    setPlayRatio(ratio: number | null) {
      applyPlayRatio(ratio)
    },
    setHoverRatio(ratio: number | null, overChart = false) {
      const chart = chartApiRef.current
      if (!chart) {
        tipApiRef.current?.setTip(null, null, [])
        return
      }
      if (ratio == null) {
        for (const el of dotRefs.current) {
          if (el) el.style.opacity = '0'
        }
        tipApiRef.current?.setTip(null, null, [])
        return
      }
      const x = ratio * X_MAX
      const wrap = wrapRef.current
      const pixelX = wrap ? ratio * wrap.clientWidth : null
      let pixelY: number | null = null
      config.values.forEach((values, index) => {
        const el = dotRefs.current[index]
        if (!el) return
        const pixel = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [
          x,
          sampleSeries(values, ratio),
        ])
        if (!Array.isArray(pixel) || pixelX == null) {
          el.style.opacity = '0'
          return
        }
        pixelY = pixel[1] as number
        el.style.transform = `translate3d(${pixelX}px, ${pixel[1]}px, 0) translate(-50%, -50%)`
        el.style.opacity = '1'
      })
      if (!overChart || pixelX == null || pixelY == null) {
        tipApiRef.current?.setTip(null, null, [])
        return
      }
      tipApiRef.current?.setTip(
        pixelX,
        pixelY,
        config.values.map((values) =>
          config.formatTick(sampleSeries(values, ratio)),
        ),
      )
    },
  }))

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none relative h-50 w-full animate-in overflow-hidden rounded-[4px] bg-[var(--tv-inset)] fade-in-0 duration-150 motion-reduce:animate-none"
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-2 bottom-2 z-0">
        {levels.map((value) => (
          <div
            key={value}
            className="absolute inset-x-0 h-px -translate-y-1/2"
            style={{
              top: `${((axis.yMax - value) / (axis.yMax - axis.yMin)) * 100}%`,
              backgroundColor: 'color-mix(in srgb, var(--ink) 9%, transparent)',
            }}
          />
        ))}
      </div>
      <div className="absolute inset-0 z-[1]">
        <ReactECharts
          notMerge
          option={option}
          style={{ height: '100%', width: '100%' }}
          onChartReady={(chart) => {
            chartApiRef.current = chart
            if (playRatioRef.current != null) {
              requestAnimationFrame(() =>
                applyPlayRatio(playRatioRef.current),
              )
            }
          }}
        />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-2 bottom-2 z-20">
        {levels.map((value) => (
          <span
            key={value}
            className="absolute left-1 -translate-y-1/2 rounded-[2px] bg-[var(--tv-inset)] px-1 text-[10px] leading-none whitespace-nowrap text-muted-foreground tabular-nums"
            style={{
              top: `${((axis.yMax - value) / (axis.yMax - axis.yMin)) * 100}%`,
            }}
          >
            {config.formatTick(value)}
          </span>
        ))}
      </div>
      {config.colors.map((color, index) => (
        <div
          key={index}
          ref={(node) => {
            dotRefs.current[index] = node
          }}
          aria-hidden
          className="absolute top-0 left-0 z-40 size-1.5 rounded-[2px] opacity-0 will-change-transform"
          style={{ backgroundColor: color, boxShadow: '0 0 0 1px var(--tv-inset)' }}
        />
      ))}
      {config.colors.map((color, index) => (
        <div
          key={`play-${index}`}
          ref={(node) => {
            playDotRefs.current[index] = node
          }}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-40 size-1.5 rounded-[2px] opacity-0 will-change-transform"
          style={{ backgroundColor: color, opacity: 0 }}
        />
      ))}
      <ChartTip
        key={mode}
        ref={tipApiRef}
        colors={config.colors}
        unit={config.unit}
        wrapRef={wrapRef}
      />
    </div>
  )
})

export const TelemetryChart = memo(TelemetryChartInner)
