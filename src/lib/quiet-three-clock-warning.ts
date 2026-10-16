'use client'

/**
 * Upstream noise filter: @react-three/fiber 9.8.x still constructs
 * `THREE.Clock` for its render loop, but three r183+ deprecates Clock in
 * favor of `THREE.Timer` and warns on every construction. We don't use Clock
 * directly, so filter that one known message until fiber migrates to Timer.
 * Matches three's `warn()` output: "THREE.Clock: ... deprecated ... Timer".
 */
const FLAG = '__trackview_three_clock_warn_patched__'

if (
  typeof window !== 'undefined' &&
  !(globalThis as unknown as Record<string, unknown>)[FLAG]
) {
  ;(globalThis as unknown as Record<string, unknown>)[FLAG] = true
  const origWarn = console.warn.bind(console)
  console.warn = (...args: unknown[]) => {
    const first = args[0]
    if (typeof first === 'string') {
      if (
        first.includes('THREE.Clock') &&
        first.includes('THREE.Timer')
      ) {
        return
      }
      if (first.includes('Clock: This module has been deprecated')) return
    }
    origWarn(...(args as Parameters<typeof console.warn>))
  }
}

export {}
