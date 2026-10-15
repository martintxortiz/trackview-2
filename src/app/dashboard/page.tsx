import type { Metadata } from 'next'
import { DashboardCanvas } from '@/components/dashboard-canvas'

export const metadata: Metadata = {
  title: 'Dashboard',
}

export default function DashboardPage() {
  return (
    <main className="relative min-h-dvh flex-1 bg-background">
      <DashboardCanvas />
    </main>
  )
}
