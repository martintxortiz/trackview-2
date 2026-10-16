'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Blocks } from 'loading-dev'
import { DashboardProvider, useDashboard } from '@/components/dashboard/store'
import { DashboardHoverTip, DashboardScene } from '@/components/dashboard/scene'
import { DashboardControls } from '@/components/dashboard/panels'
import type { DashboardInitial } from '@/components/dashboard/types'

/**
 * Full-container loader. Covers the scene until the provider clears
 * `isLoading`, then fades out so the track dissolves in underneath.
 * Needs a <DashboardProvider> above it.
 */
export function DashboardLoader() {
  const { state } = useDashboard()
  const [gone, setGone] = useState(false)
  if (state.isLoading && gone) {
    setGone(false)
  }
  useEffect(() => {
    if (state.isLoading) return
    const t = setTimeout(() => setGone(true), 600)
    return () => clearTimeout(t)
  }, [state.isLoading])
  if (gone) return null
  return (
    <div
      className={`absolute inset-0 z-30 flex items-center justify-center bg-background text-foreground transition-opacity duration-500 ${state.isLoading ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <Blocks size={24} className="opacity-40" />
    </div>
  )
}

/**
 * Inner shell. Reads loading state to crossfade the scene in while the
 * loader cover fades out. Needs a <DashboardProvider> above it.
 */
function ShellBody({
  className,
  style,
  controls,
  children,
}: {
  className?: string
  style?: CSSProperties
  controls: boolean
  children?: ReactNode
}) {
  const { state } = useDashboard()
  return (
    <div className={className ?? 'absolute inset-0'} style={style}>
      <div
        className={`absolute inset-0 transition-opacity duration-700 ${state.isLoading ? 'opacity-0' : 'opacity-100'}`}
      >
        <DashboardScene />
      </div>
      {controls ? <DashboardControls /> : null}
      <DashboardHoverTip />
      <DashboardLoader />
      {children}
    </div>
  )
}

/**
 * Drop-in dashboard shell. Put it anywhere. Fills its parent.
 * Compose smaller blocks directly for custom layouts.
 *
 * <DashboardShell /> = <DashboardProvider> + scene + controls + hover tip.
 * For a custom app, use the provider with <DashboardScene /> and
 * <DashboardControls /> placed in your own layout instead.
 */
export function DashboardShell({
  className,
  style,
  controls = true,
  initial,
  children,
}: {
  className?: string
  style?: CSSProperties
  controls?: boolean
  initial?: DashboardInitial
  children?: ReactNode
}) {
  return (
    <DashboardProvider initial={initial}>
      <ShellBody className={className} style={style} controls={controls}>
        {children}
      </ShellBody>
    </DashboardProvider>
  )
}
