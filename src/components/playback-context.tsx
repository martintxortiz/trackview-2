'use client'

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  LAP_DURATION_MS,
  PLAYBACK_JUMP_MS,
  PLAYBACK_STEP_MS,
} from '@/lib/telemetry'

type PlaybackContextValue = {
  currentTimeMs: number
  progress: number
  displayTimeMs: number
  displayProgress: number
  isPreviewing: boolean
  previewGeneration: number
  isPlaying: boolean
  setPreviewRatio: (ratio: number | null) => void
  dismissPreview: () => void
  play: () => void
  pause: () => void
  toggle: () => void
  seekMs: (ms: number) => void
  seekRatio: (ratio: number) => void
  stepBy: (deltaMs: number) => void
  stepBack: () => void
  stepForward: () => void
  jumpBack: () => void
  jumpForward: () => void
}

const PlaybackContext = createContext<PlaybackContextValue | null>(null)

function clampTime(ms: number) {
  return Math.min(LAP_DURATION_MS, Math.max(0, ms))
}

function clampRatio(ratio: number) {
  return Math.min(1, Math.max(0, ratio))
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [previewRatio, setPreviewRatioState] = useState<number | null>(null)
  const [previewGeneration, setPreviewGeneration] = useState(0)
  const timeRef = useRef(0)

  function setPreviewRatio(ratio: number | null) {
    setPreviewRatioState(ratio == null ? null : clampRatio(ratio))
  }

  function dismissPreview() {
    setPreviewRatioState(null)
    setPreviewGeneration((generation) => generation + 1)
  }

  function seekMs(ms: number) {
    const next = clampTime(ms)
    timeRef.current = next
    setCurrentTimeMs(next)
    if (next >= LAP_DURATION_MS) setIsPlaying(false)
  }

  function seekRatio(ratio: number) {
    seekMs(clampTime(clampRatio(ratio) * LAP_DURATION_MS))
  }

  function stepBy(deltaMs: number) {
    seekMs(timeRef.current + deltaMs)
  }

  function play() {
    if (timeRef.current >= LAP_DURATION_MS) {
      timeRef.current = 0
      setCurrentTimeMs(0)
    }
    setIsPlaying(true)
  }

  function pause() {
    setIsPlaying(false)
  }

  function toggle() {
    dismissPreview()
    if (isPlaying) pause()
    else play()
  }

  const onFrame = useEffectEvent((deltaMs: number) => {
    const next = clampTime(timeRef.current + deltaMs)
    timeRef.current = next
    setCurrentTimeMs(next)
    if (next >= LAP_DURATION_MS) setIsPlaying(false)
  })

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
      return
    }
    if (isEditableTarget(event.target)) return

    switch (event.key) {
      case ' ':
        event.preventDefault()
        toggle()
        break
      case 'ArrowLeft':
        event.preventDefault()
        stepBy(-PLAYBACK_JUMP_MS)
        break
      case 'ArrowRight':
        event.preventDefault()
        stepBy(PLAYBACK_JUMP_MS)
        break
      case ',':
        event.preventDefault()
        stepBy(-PLAYBACK_STEP_MS)
        break
      case '.':
        event.preventDefault()
        stepBy(PLAYBACK_STEP_MS)
        break
      default:
        break
    }
  })

  useEffect(() => {
    if (!isPlaying) return

    let frameId = 0
    let last = performance.now()

    const tick = (now: number) => {
      onFrame(now - last)
      last = now
      if (timeRef.current < LAP_DURATION_MS) {
        frameId = requestAnimationFrame(tick)
      }
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [isPlaying])

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const progress = currentTimeMs / LAP_DURATION_MS
  const displayProgress = previewRatio ?? progress
  const displayTimeMs = displayProgress * LAP_DURATION_MS

  const value: PlaybackContextValue = {
    currentTimeMs,
    progress,
    displayTimeMs,
    displayProgress,
    isPreviewing: previewRatio != null,
    previewGeneration,
    isPlaying,
    setPreviewRatio,
    dismissPreview,
    play,
    pause,
    toggle,
    seekMs,
    seekRatio,
    stepBy,
    stepBack: () => stepBy(-PLAYBACK_STEP_MS),
    stepForward: () => stepBy(PLAYBACK_STEP_MS),
    jumpBack: () => stepBy(-PLAYBACK_JUMP_MS),
    jumpForward: () => stepBy(PLAYBACK_JUMP_MS),
  }

  return (
    <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>
  )
}

export function usePlayback() {
  const ctx = useContext(PlaybackContext)
  if (!ctx) {
    throw new Error('usePlayback must be used within PlaybackProvider')
  }
  return ctx
}
