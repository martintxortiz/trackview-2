'use client'

import {
  forwardRef,
  memo,
  useImperativeHandle,
  useRef,
} from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsType } from 'echarts'
import {
  CHART_POINT_COUNT,
  CHART_SERIES_A,
  CHART_SERIES_B,
  CHART_Y_MAX,
  CHART_Y_MIN,
  sampleSeries,
  SERIES_A_COLOR,
  SERIES_B_COLOR,
} from '@/lib/telemetry'

export type TelemetryChartHandle = {
  setHoverRatio: (ratio: number | null) => void
}

const CHART_OPTS = { renderer: 'svg' as const }

const CHART_STYLE = { height: '100%', width: '100%' }

const SERIES_A_DATA = CHART_SERIES_A.map((y, i) => [i, y] as [number, number])
const SERIES_B_DATA = CHART_SERIES_B.map((y, i) => [i, y] as [number, number])
const X_MAX = CHART_POINT_COUNT - 1

const CHART_OPTION = {
  animation: false,
  backgroundColor: 'transparent',
  grid: { left: 0, right: 0, top: 8, bottom: 8 },
  xAxis: {
    type: 'value' as const,
    show: false,
    min: 0,
    max: X_MAX,
  },
  yAxis: {
    type: 'value' as const,
    show: false,
    min: CHART_Y_MIN,
    max: CHART_Y_MAX,
  },
  series: [
    {
      type: 'line' as const,
      silent: true,
      data: SERIES_A_DATA,
      showSymbol: false,
      emphasis: { disabled: true },
      lineStyle: { color: SERIES_A_COLOR, width: 1.75 },
    },
    {
      type: 'line' as const,
      silent: true,
      data: SERIES_B_DATA,
      showSymbol: false,
      emphasis: { disabled: true },
      lineStyle: { color: SERIES_B_COLOR, width: 1.75 },
    },
  ],
}

function skipChartUpdates() {
  return false
}

function placeDot(
  el: HTMLDivElement | null,
  pixel: number[] | number | null | undefined,
) {
  if (!el) return
  if (!Array.isArray(pixel) || pixel.length < 2) {
    el.style.opacity = '0'
    return
  }
  el.style.transform = `translate3d(${pixel[0]}px, ${pixel[1]}px, 0) translate(-50%, -50%)`
  el.style.opacity = '1'
}

const TelemetryChartInner = forwardRef<TelemetryChartHandle>(
  function TelemetryChartInner(_, ref) {
    const chartRef = useRef<ReactECharts>(null)
    const chartApiRef = useRef<EChartsType | null>(null)
    const dotARef = useRef<HTMLDivElement>(null)
    const dotBRef = useRef<HTMLDivElement>(null)

    function setHoverRatio(ratio: number | null) {
      const chart = chartApiRef.current ?? chartRef.current?.getEchartsInstance()
      if (!chart) return
      chartApiRef.current = chart

      if (ratio == null) {
        placeDot(dotARef.current, null)
        placeDot(dotBRef.current, null)
        return
      }

      const x = ratio * X_MAX
      placeDot(
        dotARef.current,
        chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [
          x,
          sampleSeries(CHART_SERIES_A, ratio),
        ]),
      )
      placeDot(
        dotBRef.current,
        chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [
          x,
          sampleSeries(CHART_SERIES_B, ratio),
        ]),
      )
    }

    useImperativeHandle(ref, () => ({ setHoverRatio }), [])

    return (
      <div className="pointer-events-none relative h-50 w-full overflow-hidden rounded-[4px] bg-[var(--tv-inset)]">
        <ReactECharts
          ref={chartRef}
          option={CHART_OPTION}
          style={CHART_STYLE}
          opts={CHART_OPTS}
          notMerge
          lazyUpdate
          shouldSetOption={skipChartUpdates}
          onChartReady={(chart) => {
            chartApiRef.current = chart
          }}
        />
        <div
          ref={dotARef}
          aria-hidden
          className="absolute top-0 left-0 z-10 size-1.5 rounded-full opacity-0 will-change-transform"
          style={{
            backgroundColor: SERIES_A_COLOR,
            boxShadow: '0 0 0 1px var(--tv-inset)',
          }}
        />
        <div
          ref={dotBRef}
          aria-hidden
          className="absolute top-0 left-0 z-10 size-1.5 rounded-full opacity-0 will-change-transform"
          style={{
            backgroundColor: SERIES_B_COLOR,
            boxShadow: '0 0 0 1px var(--tv-inset)',
          }}
        />
      </div>
    )
  },
)

export const TelemetryChart = memo(TelemetryChartInner)
