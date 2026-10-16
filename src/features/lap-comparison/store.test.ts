import { describe, expect, it } from 'vitest'
import { orientationFor } from '@/features/viewer'
import {
  CAR2_LATERAL_M,
  createInitialState,
  reducer,
  selectCar2Path,
  selectFollow,
  selectRacePath,
  selectTrack,
  type Action,
  type State,
} from '@/features/lap-comparison/store'

function apply(state: State, ...actions: Action[]): State {
  return actions.reduce(reducer, state)
}

describe('lap-comparison reducer', () => {
  it('starts on spa with comparison defaults (car1 hidden)', () => {
    const s = createInitialState()
    expect(s.trackId).toBe('spa')
    expect(s.rotate).toBe(orientationFor('spa').rotate)
    expect(s.flipH).toBe(orientationFor('spa').flipH)
    expect(s.layer).toBe('normal')
    expect(s.focus).toBe('free')
    expect(s.trackHover).toBe(true)
    expect(s.car1.visible).toBe(false)
    expect(s.car2.visible).toBe(false)
    expect(s.line1.visible).toBe(false)
    expect(s.line2.visible).toBe(false)
  })

  it('honors initial car1Visible override', () => {
    const s = createInitialState({ car1Visible: true })
    expect(s.car1.visible).toBe(true)
  })

  it('switches track and applies preferred framing; clears hover', () => {
    const withHover = reducer(createInitialState(), {
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

  it('releases focus when hiding the followed car', () => {
    const s = apply(
      createInitialState({ car1Visible: true }),
      { type: 'setFocus', focus: 'car1' },
      { type: 'toggleCar1Visible' },
    )
    expect(s.car1.visible).toBe(false)
    expect(s.focus).toBe('free')
  })

  it('clamps car progress to 0–1', () => {
    const s = apply(
      createInitialState(),
      { type: 'setCar1Progress', progress: 1.5 },
      { type: 'setCar2Progress', progress: -0.2 },
    )
    expect(s.car1.progress).toBe(1)
    expect(s.car2.progress).toBe(0)
  })

  it('updates zoom abs + factor via setZoom', () => {
    const s = reducer(createInitialState(), { type: 'setZoom', zoomAbs: 4 })
    expect(s.zoomAbs).toBe(4)
  })

  it('car2 path is a lateral offset of the race path, not lap b', () => {
    const s = createInitialState()
    const race = selectRacePath(s)
    const car2 = selectCar2Path(s)
    expect(car2.length).toBe(race.length)
    expect(CAR2_LATERAL_M).toBe(1.5)
    // Paths differ somewhere (offset applied).
    let differs = false
    for (let i = 0; i < race.length; i++) {
      const a = race[i]!
      const b = car2[i]!
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.01) {
        differs = true
        break
      }
    }
    expect(differs).toBe(true)
  })

  it('selectTrack returns oriented geometry for spa', () => {
    const track = selectTrack(createInitialState())
    expect(track.id).toBe('spa')
    expect(track.samples.length).toBeGreaterThan(100)
  })

  it('selectFollow is null when focus is free', () => {
    expect(selectFollow(createInitialState())).toBeNull()
  })

  it('setRotate updates continuous orientation; reset restores catalog default', () => {
    const s = createInitialState()
    const spun = reducer(s, { type: 'setRotate', rotate: 135 })
    expect(spun.rotate).toBe(135)
    const reset = reducer(spun, { type: 'resetOrientation' })
    expect(reset.rotate).toBe(orientationFor('spa').rotate)
    expect(reset.flipH).toBe(orientationFor('spa').flipH)
    expect(reset.flipV).toBe(orientationFor('spa').flipV)
  })
})
