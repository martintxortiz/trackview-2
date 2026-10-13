'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'

export type ToolbarTab = { id: string; label: string }

export type ToolbarFrameProps = {
  children: React.ReactNode
  className?: string
}

export function ToolbarFrame({ children, className }: ToolbarFrameProps) {
  return (
    <div
      className={[
        'flex items-center overflow-hidden rounded-full border border-[var(--tv-toolbar-border)] bg-[var(--tv-toolbar)] p-0.5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}

export type ToolbarProps = {
  tabs: ToolbarTab[]
  value: string
  onValueChange: (id: string) => void
}

type Pill = {
  x: number
  width: number
}

export function Toolbar({ tabs, value, onValueChange }: ToolbarProps) {
  const [pill, setPill] = useState<Pill | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return

    const measure = () => {
      const button = tabRefs.current.get(value)
      if (!button) return
      const trackRect = track.getBoundingClientRect()
      const buttonRect = button.getBoundingClientRect()
      setPill({
        x: buttonRect.left - trackRect.left,
        width: buttonRect.width,
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    const button = tabRefs.current.get(value)
    if (button) observer.observe(button)
    return () => observer.disconnect()
  }, [value])

  return (
    <div
      ref={trackRef}
      className="relative flex min-w-0 flex-nowrap items-center gap-0.5 overflow-x-auto"
    >
      {pill ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 rounded-full bg-[var(--tv-pill)]"
          initial={false}
          animate={{ x: pill.x, width: pill.width }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          style={{ left: 0 }}
        />
      ) : null}
      {tabs.map((tab) => {
        const isActive = tab.id === value
        return (
          <button
            key={tab.id}
            type="button"
            ref={(node) => {
              if (node) tabRefs.current.set(tab.id, node)
              else tabRefs.current.delete(tab.id)
            }}
            onClick={() => onValueChange(tab.id)}
            className={[
              'relative z-10 inline-flex h-7 shrink-0 !rounded-full cursor-pointer items-center justify-center px-2.5',
              isActive
                ? 'text-[var(--tv-fg)]'
                : 'text-[var(--tv-fg-muted)] hover:text-[var(--tv-fg)]',
            ].join(' ')}
          >
            <span className="whitespace-nowrap text-sm">{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
