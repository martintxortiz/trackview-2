'use client'

import { DebugPanel, ItemsPanel } from '@/components/dashboard-canvas'
import { useDashboard } from '@/components/dashboard/store'

/**
 * Place-anywhere control panels. Debug controls on the left,
 * item controls on the right. Needs a <DashboardProvider> above.
 */
export function DashboardControls() {
  const { state, derived, actions } = useDashboard()
  return (
    <>
      <DebugPanel
        showOrigin={state.showOrigin}
        trackHover={state.trackHover}
        zoom={state.zoomFactor}
        zoomAbs={state.zoomAbs}
        fps={state.fps}
        viewport={state.viewport}
        mouse={state.mouse}
        track={derived.track}
        rotate={state.rotate}
        flipH={state.flipH}
        flipV={state.flipV}
        layer={state.layer}
        palette={state.palette}
        metric={state.metric}
        traces={state.traces}
        metricsSource={state.metricsSource}
        invert={state.invert}
        sectionMap={state.sectionMap}
        zones={derived.zones}
        onToggleOrigin={actions.onToggleOrigin}
        onToggleHover={actions.onToggleHover}
        onToggleTraces={actions.onToggleTraces}
        onToggleInvert={actions.onToggleInvert}
        onTrack={actions.onTrack}
        onRotate={actions.onRotate}
        onToggleFlipH={actions.onToggleFlipH}
        onToggleFlipV={actions.onToggleFlipV}
        onLayer={actions.onLayer}
        onPalette={actions.onPalette}
        onMetric={actions.onMetric}
        onPreset={actions.onPreset}
        onSectionMap={actions.onSectionMap}
        focus={state.focus}
        onFocus={actions.onFocus}
      />
      <ItemsPanel
        car1Color={state.car1.color}
        car1Progress={state.car1.progress}
        car1Visible={state.car1.visible}
        car2Color={state.car2.color}
        car2Progress={state.car2.progress}
        car2Visible={state.car2.visible}
        onCar1Color={actions.onCar1Color}
        onCar1Progress={actions.onCar1Progress}
        onToggleCar1Visible={actions.onToggleCar1Visible}
        onCar2Color={actions.onCar2Color}
        onCar2Progress={actions.onCar2Progress}
        onToggleCar2Visible={actions.onToggleCar2Visible}
        line1Color={state.line1.color}
        line1Visible={state.line1.visible}
        line2Color={state.line2.color}
        line2Visible={state.line2.visible}
        car1Faded={state.car1.faded}
        car2Faded={state.car2.faded}
        onLine1Color={actions.onLine1Color}
        onToggleLine1Visible={actions.onToggleLine1Visible}
        onLine2Color={actions.onLine2Color}
        onToggleLine2Visible={actions.onToggleLine2Visible}
        onToggleCar1Faded={actions.onToggleCar1Faded}
        onToggleCar2Faded={actions.onToggleCar2Faded}
      />
    </>
  )
}

export { DebugPanel, ItemsPanel }
export { HeatmapLegend, SectionLegend } from '@/components/dashboard-canvas'
