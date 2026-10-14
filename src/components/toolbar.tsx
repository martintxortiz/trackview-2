'use client'

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

const LAYOUT = { type: 'spring', stiffness: 550, damping: 40 } as const

export type ToolbarTab = { id: string; label: string }

export type ToolbarFrameProps = {
  children: ReactNode
  className?: string
}

export function ToolbarFrame({ children, className }: ToolbarFrameProps) {
  return (
    <div
      className={[
        'flex items-center overflow-hidden rounded-[4px] border border-border bg-card p-0.5',
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
  label: string
}

type Pill = {
  x: number
  width: number
}

export function Toolbar({ tabs, value, onValueChange, label }: ToolbarProps) {
  const [pill, setPill] = useState<Pill | null>(null)
  const reduceMotion = useReducedMotion()
  const trackRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === value)
    if (index < 0) return

    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return

    event.preventDefault()
    const nextTab = tabs[next]
    if (!nextTab) return
    onValueChange(nextTab.id)
    tabRefs.current.get(nextTab.id)?.focus()
  }

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
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="relative flex min-w-0 flex-nowrap items-center gap-0.5 overflow-x-auto"
    >
      {pill ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 rounded-[4px] bg-secondary"
          initial={false}
          animate={{ x: pill.x, width: pill.width }}
          transition={reduceMotion ? { duration: 0 } : LAYOUT}
          style={{ left: 0 }}
        />
      ) : null}
      {tabs.map((tab) => {
        const isActive = tab.id === value
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            ref={(node) => {
              if (node) tabRefs.current.set(tab.id, node)
              else tabRefs.current.delete(tab.id)
            }}
            onClick={() => onValueChange(tab.id)}
            className={[
              'group relative z-10 inline-flex h-7 shrink-0 cursor-pointer items-center justify-center rounded-[4px] px-2.5 text-sm font-medium transition-colors duration-100',
              isActive
                ? 'text-foreground/80'
                : 'text-muted-foreground hover:text-foreground/80',
            ].join(' ')}
          >
            <span className="inline-block whitespace-nowrap transition-transform duration-100 ease-out group-active:scale-[0.96] motion-reduce:transition-none motion-reduce:group-active:scale-100">
              {tab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
