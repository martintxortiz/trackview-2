/**
 * Playground feature — reducer, panels, shell composing @/features/viewer.
 * /dashboard stays on DashboardCanvas until U09.
 */

export {
  PlaygroundProvider,
  usePlayground,
  reducer,
  createInitialState,
  selectTrack,
  selectRacePath,
  selectCar2Path,
  selectFollow,
  selectZones,
  selectOrientation,
  selectSourceTrack,
  type State,
  type Action,
  type Initial,
  type CarSlot,
  type LineSlot,
  type Derived,
  type PlaygroundContextValue,
} from '@/features/playground/store'

export {
  PlaygroundControls,
  DebugPanel,
  ItemsPanel,
  HeatmapLegend,
  SectionLegend,
} from '@/features/playground/panels'

export { PlaygroundShell } from '@/features/playground/shell'
