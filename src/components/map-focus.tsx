'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type MapFocus = {
  locked: boolean
  toggle: () => void
}

const MapFocusContext = createContext<MapFocus | null>(null)

export function MapFocusProvider({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(false)
  const value = useMemo(
    () => ({ locked, toggle: () => setLocked((on) => !on) }),
    [locked],
  )
  return <MapFocusContext.Provider value={value}>{children}</MapFocusContext.Provider>
}

export function useMapFocus() {
  const ctx = useContext(MapFocusContext)
  if (!ctx) throw new Error('useMapFocus must be used within MapFocusProvider')
  return ctx
}
