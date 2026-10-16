'use client'

/**
 * Playground debug / items panels — lean controls that dispatch Actions.
 * Display goals match the old canvas panels; built against viewer + track contracts.
 */
import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  memo,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useTheme } from 'next-themes'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { listTrackIds } from '@/track/catalog'
import {
  PALETTE_GROUPS,
  PALETTES,
  samplePalette,
  samplePaletteRgba,
  type PaletteId,
} from '@/track/colormaps'
import {
  HEATMAP_PRESETS,
  presetFor,
  type HeatmapPresetId,
  type HeatmapPresetSelection,
} from '@/track/heatmap-presets'
import {
  METRICS,
  formatMetricValue,
  lapMetrics,
  metricDisplayRange,
  metricUnit,
  seriesFor,
  type MetricId,
  type MetricsSourceId,
} from '@/track/lap-metrics'
import {
  SECTION_MAPS,
  sectionLegend,
  type SectionMapId,
  type SectionZone,
} from '@/track/section-maps'
import type { Track } from '@/track/frame'
import {
  FOCUS_OPTIONS,
  ITEM_COLORS,
  LAYERS,
  ROTATE_OPTIONS,
  heatUsesAlpha,
  type FocusTarget,
  type LayerId,
  type MouseDebug,
  type RotateDeg,
} from '@/features/viewer'
import { usePlayground } from '@/features/playground/store'

const PROGRESS_NUDGE = 0.0001

function clampProgress(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={[
        'relative h-4 w-7 shrink-0 cursor-pointer rounded-full border-0 p-0 transition-colors duration-100 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        checked ? 'bg-primary' : 'bg-input',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'absolute top-0.5 left-0.5 size-3 rounded-full bg-white transition-transform duration-100 ease-out',
          checked ? 'translate-x-3' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  )
}

function DebugRow({
  label,
  dark = false,
  children,
}: {
  label: string
  dark?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={[
        'flex h-7 items-center justify-between gap-3 px-2',
        dark ? 'bg-muted/80' : 'bg-transparent',
      ].join(' ')}
    >
      <span className="min-w-0 truncate text-[11px] text-muted-foreground">{label}</span>
      <div className="flex shrink-0 items-center justify-end">{children}</div>
    </div>
  )
}

function DebugSection({ title, children }: { title?: string; children: ReactNode }) {
  const rows: ReactNode[] = []
  Children.forEach(children, (child) => {
    if (child == null || typeof child === 'boolean') return
    if (isValidElement(child) && child.type === Fragment) {
      Children.forEach((child.props as { children?: ReactNode }).children, (grand) => {
        if (grand != null && typeof grand !== 'boolean') rows.push(grand)
      })
      return
    }
    rows.push(child)
  })
  return (
    <>
      {title ? (
        <p className="flex h-7 items-center bg-muted/80 px-2 text-[9px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {title}
        </p>
      ) : null}
      {rows.map((row, i) =>
        isValidElement<{ dark?: boolean }>(row)
          ? cloneElement(row, { dark: i % 2 === 1, key: row.key ?? i })
          : row,
      )}
    </>
  )
}

function DebugSelect({
  value,
  onValueChange,
  label,
  children,
}: {
  value: string
  onValueChange: (value: string) => void
  label: string
  children: ReactNode
}) {
  return (
    <Select value={value} onValueChange={(v) => v != null && onValueChange(v)}>
      <SelectTrigger
        aria-label={label}
        className="h-5 max-w-36 gap-1 rounded-[3px] border-0 bg-secondary px-1.5 font-mono text-[11px] tabular-nums text-secondary-foreground focus-visible:ring-ring/50"
      >
        <SelectValue className="block truncate" />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  )
}

function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const dark = mounted ? resolvedTheme !== 'light' : true
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {dark ? 'Dark' : 'Light'}
      </span>
      <Switch
        checked={dark}
        onChange={() => setTheme(dark ? 'light' : 'dark')}
        label="Toggle light mode"
      />
    </div>
  )
}

function scaleFor(zoom: number): { label: string; px: number } {
  if (!Number.isFinite(zoom) || zoom <= 0) return { label: '—', px: 0 }
  const raw = 80 / zoom
  const mag = 10 ** Math.floor(Math.log10(raw))
  const nice = raw / mag >= 5 ? 5 : raw / mag >= 2 ? 2 : 1
  const meters = nice * mag
  const label = meters >= 1000 ? `${meters / 1000} km` : `${meters} m`
  return { label, px: Math.max(8, Math.round(meters * zoom)) }
}

function paletteGradient(
  palette: PaletteId,
  traces: boolean,
  invert: boolean,
  metric: MetricId,
): string {
  const stops: string[] = []
  const alpha = heatUsesAlpha(palette, traces)
  const flip = invert && metric !== 'pedals'
  for (let i = 0; i <= 8; i++) {
    const t = flip ? 1 - i / 8 : i / 8
    if (alpha) {
      const [r, g, b, a] = samplePaletteRgba(palette, t)
      stops.push(
        `rgba(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)} / ${a.toFixed(3)})`,
      )
    } else {
      const [r, g, b] = samplePalette(palette, t)
      stops.push(`rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`)
    }
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

export const HeatmapLegend = memo(function HeatmapLegend({
  track,
  palette,
  metric,
  traces,
  metricsSource,
  invert,
  dark,
}: {
  track: Track
  palette: PaletteId
  metric: MetricId
  traces: boolean
  metricsSource: MetricsSourceId
  invert: boolean
  dark?: boolean
}) {
  const { min, max } = useMemo(() => {
    const series = seriesFor(lapMetrics(track, metricsSource), metric)
    return metricDisplayRange(metric, series)
  }, [track, metric, metricsSource])
  const name = METRICS.find((m) => m.id === metric)?.name ?? metric
  const unit = metricUnit(metric)
  const lo = metric === 'pedals' ? 'Brake' : formatMetricValue(metric, min)
  const hi = metric === 'pedals' ? 'Throttle' : formatMetricValue(metric, max)
  const gradient = useMemo(
    () => paletteGradient(palette, traces, invert, metric),
    [palette, traces, invert, metric],
  )
  return (
    <div
      className={[
        'flex flex-col gap-1.5 px-2 py-1.5',
        dark ? 'bg-muted/80' : 'bg-transparent',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">Legend</span>
        <span className="truncate font-mono text-[10px] text-muted-foreground">
          {name}
          {metric === 'pedals' ? '' : ` · ${unit}`}
        </span>
      </div>
      <div
        className="h-2 w-full rounded-[2px] bg-secondary"
        style={{ backgroundImage: gradient }}
        aria-hidden
      />
      <div className="flex items-center justify-between font-mono text-[10px] tabular-nums text-foreground/80">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
    </div>
  )
})

export const SectionLegend = memo(function SectionLegend({
  zones,
  dark = false,
}: {
  zones: SectionZone[]
  dark?: boolean
}) {
  const items = sectionLegend(zones)
  return (
    <div
      className={[
        'flex flex-col gap-1 px-2 py-1.5',
        dark ? 'bg-muted/80' : 'bg-transparent',
      ].join(' ')}
    >
      <span className="text-[11px] text-muted-foreground">Legend</span>
      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: item.color }}
              aria-hidden
            />
            <span className="truncate text-[11px] text-foreground/80">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
})

function ColorSwatches({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (color: string) => void
  label: string
}) {
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label={label}>
      {ITEM_COLORS.map((c) => {
        const active = c.value === value
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${c.id} ${label}`}
            title={c.id}
            onClick={() => onChange(c.value)}
            className={[
              'size-5 cursor-pointer rounded-[3px] border-0 p-0',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              active
                ? 'ring-2 ring-foreground ring-offset-1 ring-offset-card'
                : 'opacity-70 hover:opacity-100',
            ].join(' ')}
            style={{ background: c.value }}
          />
        )
      })}
    </div>
  )
}

export const DebugPanel = memo(function DebugPanel() {
  const { state, derived, dispatch } = usePlayground()
  const preset: HeatmapPresetSelection = presetFor(state.metric, state.palette)
  const scale = useMemo(() => scaleFor(state.zoomAbs), [state.zoomAbs])
  // Ids only — avoid trackById(all) on every render (lazy catalog invariant).
  const trackIds = listTrackIds()
  const trackLabel = derived.track.name

  return (
    <aside
      data-debug
      className="absolute top-3 left-3 z-10 w-56 overflow-hidden rounded-[4px] border border-border/55 bg-card/85 text-card-foreground shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm"
    >
      <p className="flex h-7 items-center bg-muted/80 px-2 text-[9px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        Debug
      </p>
      <div className="flex flex-col pb-0.5">
        <DebugSection>
          <DebugRow label="Track">
            <DebugSelect
              value={state.trackId}
              onValueChange={(id) => dispatch({ type: 'setTrack', trackId: id })}
              label="Track"
            >
              {trackIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {id === state.trackId ? trackLabel : id}
                </SelectItem>
              ))}
            </DebugSelect>
          </DebugRow>
          <DebugRow label="Rotate">
            <DebugSelect
              value={String(state.rotate)}
              onValueChange={(v) =>
                dispatch({ type: 'setRotate', rotate: Number(v) as RotateDeg })
              }
              label="Track rotation"
            >
              {ROTATE_OPTIONS.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.name}
                </SelectItem>
              ))}
            </DebugSelect>
          </DebugRow>
          <DebugRow label="Flip H">
            <Switch
              checked={state.flipH}
              onChange={() => dispatch({ type: 'toggleFlipH' })}
              label="Flip horizontal"
            />
          </DebugRow>
          <DebugRow label="Flip V">
            <Switch
              checked={state.flipV}
              onChange={() => dispatch({ type: 'toggleFlipV' })}
              label="Flip vertical"
            />
          </DebugRow>
        </DebugSection>
        <DebugSection title="Display">
          <DebugRow label="Theme">
            <ThemeSwitch />
          </DebugRow>
          <DebugRow label="Layer">
            <DebugSelect
              value={state.layer}
              onValueChange={(v) => dispatch({ type: 'setLayer', layer: v as LayerId })}
              label="Layer"
            >
              {LAYERS.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </DebugSelect>
          </DebugRow>
          {state.layer === 'sections' ? (
            <>
              <DebugRow label="Preset">
                <DebugSelect
                  value={state.sectionMap}
                  onValueChange={(v) =>
                    dispatch({ type: 'setSectionMap', sectionMap: v as SectionMapId })
                  }
                  label="Preset"
                >
                  {SECTION_MAPS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </DebugSelect>
              </DebugRow>
              <SectionLegend zones={derived.zones} />
            </>
          ) : null}
          {state.layer === 'heatmap' ? (
            <>
              <DebugRow label="Preset">
                <DebugSelect
                  value={preset}
                  onValueChange={(v) => {
                    if (v === 'custom') return
                    dispatch({ type: 'setPreset', presetId: v as HeatmapPresetId })
                  }}
                  label="Preset"
                >
                  {HEATMAP_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                  {preset === 'custom' ? (
                    <SelectItem value="custom">Custom</SelectItem>
                  ) : null}
                </DebugSelect>
              </DebugRow>
              <DebugRow label="Palette">
                <DebugSelect
                  value={state.palette}
                  onValueChange={(v) =>
                    dispatch({ type: 'setPalette', palette: v as PaletteId })
                  }
                  label="Palette"
                >
                  {PALETTE_GROUPS.map((group) => (
                    <SelectGroup key={group.id}>
                      <SelectLabel>{group.name}</SelectLabel>
                      {PALETTES.filter((p) => p.group === group.id).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </DebugSelect>
              </DebugRow>
              <DebugRow label="Value">
                <DebugSelect
                  value={state.metric}
                  onValueChange={(v) =>
                    dispatch({ type: 'setMetric', metric: v as MetricId })
                  }
                  label="Value"
                >
                  {METRICS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </DebugSelect>
              </DebugRow>
              <DebugRow label="Traces">
                <Switch
                  checked={state.traces}
                  onChange={() => dispatch({ type: 'toggleTraces' })}
                  label="Traces"
                />
              </DebugRow>
              <DebugRow label="Invert">
                <Switch
                  checked={state.invert}
                  onChange={() => dispatch({ type: 'toggleInvert' })}
                  label="Invert heatmap"
                />
              </DebugRow>
              <HeatmapLegend
                track={derived.track}
                palette={state.palette}
                metric={state.metric}
                traces={state.traces}
                metricsSource={state.metricsSource}
                invert={state.invert}
              />
            </>
          ) : null}
        </DebugSection>
        <DebugSection title="View">
          <DebugRow label="Focus">
            <DebugSelect
              value={state.focus}
              onValueChange={(v) =>
                dispatch({ type: 'setFocus', focus: v as FocusTarget })
              }
              label="Camera focus"
            >
              {FOCUS_OPTIONS.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </DebugSelect>
          </DebugRow>
          <DebugRow label="Zoom">
            <span className="font-mono text-[11px] tabular-nums text-foreground/80">
              {state.zoomFactor.toFixed(2)}×
            </span>
          </DebugRow>
          <DebugRow label="FPS">
            <span className="font-mono text-[11px] tabular-nums text-foreground/80">
              {state.fps > 0 ? state.fps : '—'}
            </span>
          </DebugRow>
          <DebugRow label="Viewport">
            <span className="font-mono text-[11px] tabular-nums text-foreground/80">
              {state.viewport.x.toFixed(1)}, {state.viewport.y.toFixed(1)}
            </span>
          </DebugRow>
          <DebugRow label="Mouse">
            <MouseReadout mouse={state.mouse} />
          </DebugRow>
          <DebugRow label="Scale">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[11px] tabular-nums text-foreground/80">
                {scale.label}
              </span>
              <div
                aria-hidden
                className="h-[5px] border-r-2 border-b-2 border-l-2 border-muted-foreground"
                style={{ width: scale.px }}
              />
            </div>
          </DebugRow>
          <DebugRow label="Origin">
            <Switch
              checked={state.showOrigin}
              onChange={() => dispatch({ type: 'toggleOrigin' })}
              label="Origin"
            />
          </DebugRow>
          <DebugRow label="Hover">
            <Switch
              checked={state.trackHover}
              onChange={() => dispatch({ type: 'toggleHover' })}
              label="Track hover"
            />
          </DebugRow>
        </DebugSection>
      </div>
    </aside>
  )
})

function MouseReadout({ mouse }: { mouse: MouseDebug | null }) {
  return (
    <span className="font-mono text-[11px] tabular-nums text-foreground/80">
      {mouse ? `${mouse.x.toFixed(1)}, ${mouse.y.toFixed(1)}` : '—'}
    </span>
  )
}

export const ItemsPanel = memo(function ItemsPanel() {
  const { state, dispatch } = usePlayground()
  const car1Pct = Math.round(state.car1.progress * 1000) / 10
  const car2Pct = Math.round(state.car2.progress * 1000) / 10

  return (
    <aside
      data-debug
      className="absolute top-3 right-3 z-10 w-56 overflow-hidden rounded-[4px] border border-border/55 bg-card/85 text-card-foreground shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm"
    >
      <p className="flex h-7 items-center bg-muted/80 px-2 text-[9px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        Items
      </p>
      <div className="flex flex-col pb-0.5">
        <DebugSection title="Car 1">
          <DebugRow label="Color">
            <ColorSwatches
              value={state.car1.color}
              onChange={(color) => dispatch({ type: 'setCar1Color', color })}
              label="Car 1 color"
            />
          </DebugRow>
          <DebugRow label="Progress">
            <div className="flex items-center gap-1">
              <span className="font-mono text-[11px] tabular-nums text-foreground/80">
                {car1Pct}%
              </span>
              <button
                type="button"
                aria-label="Nudge car 1 backward"
                onClick={() =>
                  dispatch({
                    type: 'setCar1Progress',
                    progress: clampProgress(state.car1.progress - PROGRESS_NUDGE),
                  })
                }
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-[3px] border-0 bg-secondary p-0 font-mono text-[12px] leading-none text-secondary-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                −
              </button>
              <button
                type="button"
                aria-label="Nudge car 1 forward"
                onClick={() =>
                  dispatch({
                    type: 'setCar1Progress',
                    progress: clampProgress(state.car1.progress + PROGRESS_NUDGE),
                  })
                }
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-[3px] border-0 bg-secondary p-0 font-mono text-[12px] leading-none text-secondary-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                +
              </button>
            </div>
          </DebugRow>
          <DebugRow label="Visible">
            <Switch
              checked={state.car1.visible}
              onChange={() => dispatch({ type: 'toggleCar1Visible' })}
              label="Toggle car 1 visibility"
            />
          </DebugRow>
          <DebugRow label="Dimmed">
            <Switch
              checked={state.car1.faded}
              onChange={() => dispatch({ type: 'toggleCar1Faded' })}
              label="Fade car 1 line behind the car"
            />
          </DebugRow>
        </DebugSection>
        <div className="px-2 py-1.5">
          <input
            type="range"
            min={0}
            max={100000}
            value={Math.round(state.car1.progress * 100000)}
            onChange={(e) =>
              dispatch({
                type: 'setCar1Progress',
                progress: Number(e.target.value) / 100000,
              })
            }
            aria-label="Car 1 progress along lap"
            className="w-full cursor-pointer"
            style={{ accentColor: state.car1.color }}
          />
        </div>
        <DebugSection title="Car 2">
          <DebugRow label="Color">
            <ColorSwatches
              value={state.car2.color}
              onChange={(color) => dispatch({ type: 'setCar2Color', color })}
              label="Car 2 color"
            />
          </DebugRow>
          <DebugRow label="Progress">
            <div className="flex items-center gap-1">
              <span className="font-mono text-[11px] tabular-nums text-foreground/80">
                {car2Pct}%
              </span>
              <button
                type="button"
                aria-label="Nudge car 2 backward"
                onClick={() =>
                  dispatch({
                    type: 'setCar2Progress',
                    progress: clampProgress(state.car2.progress - PROGRESS_NUDGE),
                  })
                }
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-[3px] border-0 bg-secondary p-0 font-mono text-[12px] leading-none text-secondary-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                −
              </button>
              <button
                type="button"
                aria-label="Nudge car 2 forward"
                onClick={() =>
                  dispatch({
                    type: 'setCar2Progress',
                    progress: clampProgress(state.car2.progress + PROGRESS_NUDGE),
                  })
                }
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-[3px] border-0 bg-secondary p-0 font-mono text-[12px] leading-none text-secondary-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                +
              </button>
            </div>
          </DebugRow>
          <DebugRow label="Visible">
            <Switch
              checked={state.car2.visible}
              onChange={() => dispatch({ type: 'toggleCar2Visible' })}
              label="Toggle car 2 visibility"
            />
          </DebugRow>
          <DebugRow label="Dimmed">
            <Switch
              checked={state.car2.faded}
              onChange={() => dispatch({ type: 'toggleCar2Faded' })}
              label="Fade car 2 line behind the car"
            />
          </DebugRow>
        </DebugSection>
        <div className="px-2 py-1.5">
          <input
            type="range"
            min={0}
            max={100000}
            value={Math.round(state.car2.progress * 100000)}
            onChange={(e) =>
              dispatch({
                type: 'setCar2Progress',
                progress: Number(e.target.value) / 100000,
              })
            }
            aria-label="Car 2 progress along lap"
            className="w-full cursor-pointer"
            style={{ accentColor: state.car2.color }}
          />
        </div>
        <DebugSection title="Racing line 1">
          <DebugRow label="Color">
            <ColorSwatches
              value={state.line1.color}
              onChange={(color) => dispatch({ type: 'setLine1Color', color })}
              label="Racing line 1 color"
            />
          </DebugRow>
          <DebugRow label="Visible">
            <Switch
              checked={state.line1.visible}
              onChange={() => dispatch({ type: 'toggleLine1Visible' })}
              label="Toggle racing line 1 visibility"
            />
          </DebugRow>
        </DebugSection>
        <DebugSection title="Racing line 2">
          <DebugRow label="Color">
            <ColorSwatches
              value={state.line2.color}
              onChange={(color) => dispatch({ type: 'setLine2Color', color })}
              label="Racing line 2 color"
            />
          </DebugRow>
          <DebugRow label="Visible">
            <Switch
              checked={state.line2.visible}
              onChange={() => dispatch({ type: 'toggleLine2Visible' })}
              label="Toggle racing line 2 visibility"
            />
          </DebugRow>
        </DebugSection>
      </div>
    </aside>
  )
})

/** Place-anywhere playground controls. */
export function PlaygroundControls() {
  return (
    <>
      <DebugPanel />
      <ItemsPanel />
    </>
  )
}
