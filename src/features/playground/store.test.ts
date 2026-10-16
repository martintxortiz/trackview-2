import { describe, expect, it } from 'vitest'
import { orientationFor } from '@/features/viewer'
import {
  createInitialState,
  reducer,
  selectFollow,
  selectTrack,
  type Action,
  type State,
} from '@/features/playground/store'

function apply(state: State, ...actions: Action[]): State {
  return actions.reduce(reducer, state)
}

describe('playground reducer', () => {
  it('starts on spa with preferred orientation', () => {
    const s = createInitialState()
    expect(s.trackId).toBe('spa')
    expect(s.rotate).toBe(orientationFor('spa').rotate)
    expect(s.flipH).toBe(orientationFor('spa').flipH)
    expect(s.layer).toBe('normal')
    expect(s.focus).toBe('free')
    expect(s.trackHover).toBe(true)
    expect(s.car1.visible).toBe(true)
    expect(s.car2.visible).toBe(false)
  })

  it('switches track and applies preferred framing; clears hover', () => {
    const base = createInitialState()
    const withHover = reducer(base, {
      type: 'setHover',
      info: {
        t: 0.1,
        x: 0,
        y: 0,
        sx: 1,
        sy: 1,
        cursorSx: 1,
        cursorSy: 1,
        edgePx: 4,
        color: '#fff',
        label: 'x',
      },
    })
    const next = reducer(withHover, { type: 'setTrack', trackId: 'monza' })
    expect(next.trackId).toBe('monza')
    expect(next.rotate).toBe(orientationFor('monza').rotate)
    expect(next.flipH).toBe(orientationFor('monza').flipH)
    expect(next.flipV).toBe(orientationFor('monza').flipV)
    expect(next.hoverInfo).toBeNull()
  })

  it('ignores unknown track ids', () => {
    const s = createInitialState()
    expect(reducer(s, { type: 'setTrack', trackId: 'not-a-track' })).toBe(s)
  })

  it('toggles layer and clears hover', () => {
    const s = apply(createInitialState(), { type: 'setLayer', layer: 'heatmap' })
    expect(s.layer).toBe('heatmap')
    const cleared = apply(
      reducer(s, {
        type: 'setHover',
        info: {
          t: 0,
          x: 0,
          y: 0,
          sx: 0,
          sy: 0,
          cursorSx: 0,
          cursorSy: 0,
          edgePx: 1,
          color: '#0f0',
          label: 'a',
        },
      }),
      { type: 'setLayer', layer: 'sections' },
    )
    expect(cleared.layer).toBe('sections')
    expect(cleared.hoverInfo).toBeNull()
  })

  it('applies heatmap preset metric + palette', () => {
    const s = reducer(createInitialState(), { type: 'setPreset', presetId: 'brake' })
    expect(s.metric).toBe('brake')
    expect(s.palette).toBe('red')
  })

  it('toggles hover off and clears tip', () => {
    const withTip = reducer(createInitialState(), {
      type: 'setHover',
      info: {
        t: 0.2,
        x: 1,
        y: 2,
        sx: 3,
        sy: 4,
        cursorSx: 3,
        cursorSy: 4,
        edgePx: 2,
        color: '#f00',
        label: 'tip',
      },
    })
    const off = reducer(withTip, { type: 'toggleHover' })
    expect(off.trackHover).toBe(false)
    expect(off.hoverInfo).toBeNull()
  })

  it('sets focus targets', () => {
    const s = apply(
      createInitialState(),
      { type: 'setFocus', focus: 'car1' },
      { type: 'setFocus', focus: 'origin' },
    )
    expect(s.focus).toBe('origin')
  })

  it('releases focus when hiding the followed car', () => {
    const s = apply(
      createInitialState(),
      { type: 'setFocus', focus: 'car1' },
      { type: 'toggleCar1Visible' },
    )
    expect(s.car1.visible).toBe(false)
    expect(s.focus).toBe('free')
  })

  it('clamps car progress to [0, 1]', () => {
    const s = apply(
      createInitialState(),
      { type: 'setCar1Progress', progress: 1.5 },
      { type: 'setCar2Progress', progress: -0.2 },
    )
    expect(s.car1.progress).toBe(1)
    expect(s.car2.progress).toBe(0)
  })

  it('updates section map and camera rotate without geometry in reducer', () => {
    const s = apply(
      createInitialState(),
      { type: 'setSectionMap', sectionMap: 'ers-2025' },
      { type: 'setRotate', rotate: 180 },
      { type: 'toggleFlipH' },
    )
    expect(s.sectionMap).toBe('ers-2025')
    expect(s.rotate).toBe(180)
    expect(s.flipH).toBe(!orientationFor('spa').flipH)
  })
})

describe('playground selectors', () => {
  it('orients spa track for selectTrack', () => {
    const track = selectTrack(createInitialState())
    expect(track.id).toBe('spa')
    expect(track.samples.length).toBeGreaterThan(100)
  })

  it('follow is null in free camera; origin at zero', () => {
    const free = selectFollow(createInitialState())
    expect(free).toBeNull()
    const origin = selectFollow(
      reducer(createInitialState(), { type: 'setFocus', focus: 'origin' }),
    )
    expect(origin).toEqual({ x: 0, z: 0 })
  })

  it('follow car1 returns a finite world point', () => {
    const s = apply(
      createInitialState(),
      { type: 'setFocus', focus: 'car1' },
      { type: 'setCar1Progress', progress: 0.25 },
    )
    const f = selectFollow(s)
    expect(f).not.toBeNull()
    expect(Number.isFinite(f!.x)).toBe(true)
    expect(Number.isFinite(f!.z)).toBe(true)
  })
})
