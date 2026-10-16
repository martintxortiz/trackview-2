/**
 * Viewer public surface — scene pieces + math matching dashboard-canvas exports.
 * Canvas remains the runtime pin until U09; U05/U06 import from here.
 */

export {
  FILL_SPACING_M,
  FOCUS_OPTIONS,
  ITEM_COLORS,
  LAYERS,
  ROTATE_OPTIONS,
  type FocusTarget,
  type FlyState,
  type HeatPaint,
  type LayerId,
  type MouseDebug,
  type RoadProps,
  type RotateDeg,
  type TrackHoverInfo,
  type TrackOrientation,
  type View,
} from '@/features/viewer/contracts'

export {
  centerTrack,
  compensateViewRotate,
  fitTrack,
  heatUsesAlpha,
  metricRgbaAt,
  newView,
  orientRacePoints,
  orientTrack,
  orientationFor,
  paintMetricColors,
  place,
  poseOnPath,
  rotateCw,
  shadeRgb,
  vClearAnchor,
  ZOOM_IN,
  ZOOM_IN_FOCUSED,
  ZOOM_OUT,
} from '@/features/viewer/math'

export { Road } from '@/features/viewer/road'
export { RacingLine } from '@/features/viewer/racing-line'
export { ItemCar } from '@/features/viewer/item-car'
export { Camera, Grid, SizeProbe, FLY_S } from '@/features/viewer/rig'
export {
  HoverMark,
  TrackHoverProbe,
  TrackHoverTip,
  hoverPayload,
  nearestOnTrack,
} from '@/features/viewer/hover-probe'
export {
  ViewerScene,
  ViewerHoverOverlay,
  type ViewerItem,
  type ViewerSceneProps,
} from '@/features/viewer/shell'
