/**
 * Lap-comparison public surface — store, chrome, scene, shell.
 * Does not import playground or dashboard-canvas.
 */

export {
  CAR2_LATERAL_M,
  ComparisonProvider,
  createInitialState,
  reducer,
  selectCar2Path,
  selectFollow,
  selectRacePath,
  selectTrack,
  selectZones,
  useComparison,
  type Action,
  type ComparisonChrome,
  type Initial,
  type State,
} from '@/features/lap-comparison/store'

export {
  BackButton,
  BottomLeftControls,
  CornerButton,
  UserBar,
} from '@/features/lap-comparison/chrome'

export { ComparisonScene } from '@/features/lap-comparison/comparison-scene'
export { LapComparisonShell } from '@/features/lap-comparison/shell'
export { LapComparisonShellEntry } from '@/features/lap-comparison/shell-entry'
