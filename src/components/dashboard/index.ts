/**
 * Dashboard building blocks. Put any piece anywhere.
 *
 * - <DashboardProvider> + useDashboard() for state.
 * - <DashboardScene /> for the 3D canvas.
 * - <DashboardControls /> for debug and item panels.
 * - <DashboardHoverTip /> for the floating hover readout.
 * - <DashboardShell /> for the drop-in full dashboard.
 * - Scene primitives (Road, Grid, Camera, RacingLine, ItemCar, hover)
 *   and control primitives (DebugPanel, ItemsPanel, legends) for custom builds.
 */

export { DashboardProvider, useDashboard } from '@/components/dashboard/store'
export { DashboardHoverTip, DashboardScene } from '@/components/dashboard/scene'
export {
  DashboardControls,
  DebugPanel,
  HeatmapLegend,
  ItemsPanel,
  SectionLegend,
} from '@/components/dashboard/panels'
export { DashboardLoader, DashboardShell } from '@/components/dashboard/shell'
export type {
  CarSlot,
  DashboardActions,
  DashboardContextValue,
  DashboardDerived,
  DashboardInitial,
  DashboardState,
  FocusTarget,
  LayerId,
  LineSlot,
  MouseDebug,
  RotateDeg,
  TrackHoverInfo,
  TrackOrientation,
  View,
} from '@/components/dashboard/types'
export {
  Camera,
  CATALOG,
  FOCUS_OPTIONS,
  fitTrack,
  Grid,
  HoverMark,
  ItemCar,
  ITEM_COLORS,
  LAYERS,
  newView,
  orientRacePoints,
  orientTrack,
  orientationFor,
  place,
  poseOnPath,
  RacingLine,
  Road,
  ROTATE_OPTIONS,
  SizeProbe,
  StateProbe,
  TrackHoverProbe,
  TrackHoverTip,
} from '@/components/dashboard-canvas'
