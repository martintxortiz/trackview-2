'use client'

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

export type ToolbarTab = { id: string; label: string }

export function ToolbarFrame({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
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

export function Toolbar({
  tabs,
  value,
  onValueChange,
  label,
}: {
  tabs: ToolbarTab[]
  value: string
  onValueChange: (id: string) => void
  label: string
}) {
  const reduceMotion = useReducedMotion()
  const pillId = useId()
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === value)
    if (index < 0) return
    let next = -1
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft')
      next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    const nextTab = tabs[next]!
    onValueChange(nextTab.id)
    tabRefs.current.get(nextTab.id)?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="relative flex min-w-0 flex-nowrap items-center gap-0.5 overflow-x-auto"
    >
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
              'group relative inline-flex h-7 shrink-0 cursor-pointer items-center justify-center rounded-[4px] px-2.5 text-sm font-medium transition-colors duration-100',
              isActive
                ? 'text-foreground/80'
                : 'text-muted-foreground hover:text-foreground/80',
            ].join(' ')}
          >
            {isActive ? (
              <motion.span
                aria-hidden
                layoutId={pillId}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 550, damping: 40 }
                }
                className="pointer-events-none absolute inset-0 rounded-[3px] bg-secondary"
              />
            ) : null}
            <span className="relative z-10 inline-block whitespace-nowrap transition-transform duration-100 ease-out group-active:scale-[0.96] motion-reduce:transition-none motion-reduce:group-active:scale-100">
              {tab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
