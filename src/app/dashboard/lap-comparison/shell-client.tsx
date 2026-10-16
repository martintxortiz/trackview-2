'use client'

import dynamic from 'next/dynamic'
import { Blocks } from 'loading-dev'
import type { DashboardInitial } from '@/components/dashboard/types'

/**
 * Client-only wrapper: the 3D dashboard pulls in three.js + the full
 * 25-track catalog and resamples geometry on mount (~600ms of server work
 * when SSR'd). `ssr: false` must live in a Client Component, so the page
 * (a Server Component) renders this instead — the server then only emits
 * chrome (back button + avatar) plus a light fallback.
 */
const DashboardShellNoSSR = dynamic(
  () => import('@/components/dashboard/shell').then((m) => m.DashboardShell),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center bg-background text-foreground">
        <Blocks size={24} className="opacity-40" />
      </div>
    ),
  },
)

export function LapComparisonShell({
  controls = false,
  initial,
}: {
  controls?: boolean
  initial?: DashboardInitial
}) {
  return <DashboardShellNoSSR controls={controls} initial={initial} />
}
