import type { Metadata } from 'next'
import { BackButton, BottomLeftControls, UserBar } from './chrome'
import { LapComparisonShell } from './shell-client'

export const metadata: Metadata = {
  title: 'Lap Comparison',
}

export default function LapComparisonPage() {
  return (
    <main className="relative min-h-dvh flex-1 bg-background">
      <LapComparisonShell controls={false} initial={{ car1Visible: false }} />
      <BackButton />
      <UserBar />
      <BottomLeftControls />
    </main>
  )
}
