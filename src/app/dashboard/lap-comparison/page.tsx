import type { Metadata } from 'next'
import { LapComparisonShellEntry } from '@/features/lap-comparison/shell-entry'

export const metadata: Metadata = {
  title: 'Lap Comparison',
}

export default function LapComparisonPage() {
  return (
    <main className="relative min-h-dvh flex-1 bg-background">
      <LapComparisonShellEntry
        controls={false}
        initial={{ car1Visible: false, loading: true }}
      />
    </main>
  )
}
