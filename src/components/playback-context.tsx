'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  distanceRatioToTime,
  LAP_DURATION_MS,
  PLAYBACK_JUMP_MS,
  PLAYBACK_RATES,
  PLAYBACK_STEP_MS,
  timeRatioToDistance,
  type PlaybackRate,
} from '@/lib/telemetry'

type PlaybackState = {
  currentTimeMs: number
  /** Distance along the lap 0–1 — scrubber, chart, and car share this. */
  progress: number
  displayTimeMs: number
  displayProgress: number
  isPreviewing: boolean
  previewGeneration: number
  isPlaying: boolean
}

type PlaybackActions = {
  setPreviewRatio: (ratio: number | null) => void
  dismissPreview: () => void
  play: () => void
  pause: () => void
  toggle: () => void
  seekMs: (ms: number) => void
  seekRatio: (ratio: number) => void
  stepBack: () => void
  stepForward: () => void
  jumpBack: () => void
  jumpForward: () => void
  setPlaybackRate: (rate: PlaybackRate) => void
  cyclePlaybackRate: () => void
}

const StateContext = createContext<PlaybackState | null>(null)
const ActionsContext = createContext<PlaybackActions | null>(null)
const RateContext = createContext<PlaybackRate>(1)

const clampTime = (ms: number) => Math.min(LAP_DURATION_MS, Math.max(0, ms))
const clampRatio = (r: number) => Math.min(1, Math.max(0, r))

const timeFromDistance = (distance: number) =>
  distanceRatioToTime(clampRatio(distance)) * LAP_DURATION_MS

/**
 * Armed by dismissPreview/toggle so the scrubber ignores the next
 * movement-less mousemove (layout shifts firing synthetic events).
 * Read and cleared directly — no subscription, no re-render.
 */
export const hoverSuppress = { current: false }

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRateState] = useState<PlaybackRate>(1)
  const [previewRatio, setPreviewRatioState] = useState<number | null>(null)
  const [previewGeneration, setPreviewGeneration] = useState(0)
  const timeRef = useRef(0)
  const playingRef = useRef(false)
  const rateRef = useRef<PlaybackRate>(1)
  useEffect(() => {
    playingRef.current = isPlaying
  }, [isPlaying])
  useEffect(() => {
    rateRef.current = playbackRate
  }, [playbackRate])

  const seekMs = useCallback((ms: number) => {
    const next = clampTime(ms)
    timeRef.current = next
    setCurrentTimeMs(next)
    if (next >= LAP_DURATION_MS) setIsPlaying(false)
  }, [])

  const setPreviewRatio = useCallback((ratio: number | null) => {
    if (ratio == null) {
      setPreviewRatioState(null)
      return
    }
    setPreviewRatioState(clampRatio(ratio))
    setIsPlaying(false)
  }, [])
  const dismissPreview = useCallback(() => {
    hoverSuppress.current = true
    setPreviewRatioState(null)
    setPreviewGeneration((g) => g + 1)
  }, [])
  const play = useCallback(() => {
    setPreviewRatioState(null)
    setPreviewGeneration((g) => g + 1)
    if (timeRef.current >= LAP_DURATION_MS) {
      timeRef.current = 0
      setCurrentTimeMs(0)
    }
    setIsPlaying(true)
  }, [])
  const pause = useCallback(() => setIsPlaying(false), [])
  const toggle = useCallback(() => {
    hoverSuppress.current = true
    setPreviewRatioState(null)
    setPreviewGeneration((g) => g + 1)
    if (playingRef.current) setIsPlaying(false)
    else {
      if (timeRef.current >= LAP_DURATION_MS) {
        timeRef.current = 0
        setCurrentTimeMs(0)
      }
      setIsPlaying(true)
    }
  }, [])

  const setPlaybackRate = useCallback((rate: PlaybackRate) => {
    setPlaybackRateState(rate)
  }, [])
  const cyclePlaybackRate = useCallback(() => {
    setPlaybackRateState((prev) => {
      const i = PLAYBACK_RATES.indexOf(prev)
      return PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length]!
    })
  }, [])

  // rAF loop — single setState per frame; wall time × playback rate.
  useEffect(() => {
    if (!isPlaying) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const next = clampTime(
        timeRef.current + (now - last) * rateRef.current,
      )
      last = now
      timeRef.current = next
      setCurrentTimeMs(next)
      if (next >= LAP_DURATION_MS) setIsPlaying(false)
      else frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [isPlaying])

  // seekMs/toggle are stable — the listener registers once, no stale closures.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      if (isEditable(e.target)) return
      switch (e.key) {
        case ' ':
          e.preventDefault()
          toggle()
          break
        case 'ArrowLeft':
          e.preventDefault()
          seekMs(timeRef.current - PLAYBACK_JUMP_MS)
          break
        case 'ArrowRight':
          e.preventDefault()
          seekMs(timeRef.current + PLAYBACK_JUMP_MS)
          break
        case ',':
          e.preventDefault()
          seekMs(timeRef.current - PLAYBACK_STEP_MS)
          break
        case '.':
          e.preventDefault()
          seekMs(timeRef.current + PLAYBACK_STEP_MS)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [seekMs, toggle])

  // Actions are stable — consumers don't re-render on tick.
  const actions = useMemo<PlaybackActions>(
    () => ({
      setPreviewRatio,
      dismissPreview,
      play,
      pause,
      toggle,
      seekMs,
      seekRatio: (ratio) => seekMs(timeFromDistance(ratio)),
      stepBack: () => seekMs(timeRef.current - PLAYBACK_STEP_MS),
      stepForward: () => seekMs(timeRef.current + PLAYBACK_STEP_MS),
      jumpBack: () => seekMs(timeRef.current - PLAYBACK_JUMP_MS),
      jumpForward: () => seekMs(timeRef.current + PLAYBACK_JUMP_MS),
      setPlaybackRate,
      cyclePlaybackRate,
    }),
    [
      setPreviewRatio,
      dismissPreview,
      play,
      pause,
      toggle,
      seekMs,
      setPlaybackRate,
      cyclePlaybackRate,
    ],
  )

  // Only progress readers re-render at 60fps.
  const state = useMemo<PlaybackState>(() => {
    const progress = timeRatioToDistance(currentTimeMs / LAP_DURATION_MS)
    const displayProgress = previewRatio ?? progress
    const displayTimeMs =
      previewRatio != null
        ? timeFromDistance(previewRatio)
        : currentTimeMs
    return {
      currentTimeMs,
      progress,
      displayTimeMs,
      displayProgress,
      isPreviewing: previewRatio != null,
      previewGeneration,
      isPlaying,
    }
  }, [currentTimeMs, previewRatio, previewGeneration, isPlaying])

  return (
    <ActionsContext.Provider value={actions}>
      <RateContext.Provider value={playbackRate}>
        <StateContext.Provider value={state}>{children}</StateContext.Provider>
      </RateContext.Provider>
    </ActionsContext.Provider>
  )
}

/** Tick-driven values (progress, play state). Re-renders every frame while playing. */
export function usePlayback() {
  const ctx = useContext(StateContext)
  if (!ctx) throw new Error('usePlayback must be used within PlaybackProvider')
  return ctx
}

/** Stable callbacks — never cause re-renders. */
export function usePlaybackActions() {
  const ctx = useContext(ActionsContext)
  if (!ctx)
    throw new Error('usePlaybackActions must be used within PlaybackProvider')
  return ctx
}

/** Playback rate only — does not tick with the playhead. */
export function usePlaybackRate() {
  return useContext(RateContext)
}
