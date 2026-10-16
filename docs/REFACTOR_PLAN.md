# Refactor plan. Trackview v2

## 1. What the app does, and the direction you recommend

Trackview is a race analysis viewer. It shows circuit geometry in 3D and paints telemetry onto the road. A user picks a track and scrubs a lap. The app answers where time is won or lost.

Domain concepts are small. A session holds laps. A lap holds samples. A sector is a slice of a lap. A driver owns a lap. Telemetry is speed, throttle, brake, and derived proxies over distance.

Data flows in four steps. Source files hold centerlines and racelines. A catalog registers them. Analysis builds speed and section zones from physics or real traces. UI samples those series and draws ribbons in Three.js.

Source files today:

- `src/track/spa.ts` through `src/track/zandvoort.ts` hold ground truth centerlines.
- `src/track/data/spa-telemetry.json`, `monza-telemetry.json`, `texas-telemetry.json` hold real FastF1 traces.
- `scripts/tumftm/tracks/*.csv` and `scripts/tumftm/racelines/*.csv` are the true sources.
- `scripts/build-tracks.mjs:75` generates each `src/track/<id>.ts`.
- `scripts/fetch-f1-telemetry.py` generates the telemetry JSON files.

Features a user sees:

- `/dashboard` is the playground. It renders `src/components/dashboard-canvas.tsx` through `src/components/dashboard/shell.tsx`. It exposes road, racing line, heatmap, sections, cars, hover probe, camera presets, debug panels, and item panels.
- `/dashboard/lap-comparison` is the real app. `src/app/dashboard/lap-comparison/page.tsx:9` renders `LapComparisonShell` with controls off and car one hidden. `chrome.tsx` adds back button, user bar, and bottom left controls. `shell-client.tsx` loads the shell with `ssr:false`.

Recommended direction. Keep the playground. Isolate the real app. Move data out of logic files. Split the 3697 line canvas into one way layers. Define domain contracts once. Let lap comparison and future analyses code against contracts. Delete nothing with a possible reuse except code with no purpose. Rebuild bloated components from goals without reading the old code.

Skills used and missing. I used `how` to trace data flow. I used `why` on git log and comments. I used `architect` to compare target shapes. I used `unslop` to keep this plan plain. I used `typescript-best-practices` as the typing bar. `benchmark-checklist` was not installed. I defined measurements manually in section 7. I ran a single model self review in place of `interrogate` because multi model review was not available in this session. That gap is noted in section 8.

## 2. Current architecture and the cause of the autocomplete freeze

Current layers are flat and tangled. `src/track/*` holds types, physics, palettes, sections, geometry, telemetry, and JSON imports in one folder. `src/components/dashboard-canvas.tsx` holds scene, geometry building, state derivation, camera math, panels, and legends in one file. `src/components/dashboard/*` wraps that file instead of replacing it. `src/lib/telemetry.ts` holds Spa only playback state. `src/components/*` holds a deprecated viewer next to the new viewer.

Dependency diagram today:

- `src/app/dashboard/page.tsx` imports `src/components/dashboard-canvas.tsx`.
- `src/app/dashboard/lap-comparison/page.tsx` imports `chrome.tsx` and `shell-client.tsx`.
- `shell-client.tsx` imports `src/components/dashboard/*`.
- `src/components/dashboard/store.tsx`, `scene.tsx`, `panels.tsx`, `shell.tsx` all import `src/components/dashboard-canvas.tsx`.
- `dashboard-canvas.tsx:33` and `store.tsx:15` both import `src/track/catalog.ts`.
- `catalog.ts:7` imports all 25 track modules.
- `lap-metrics.ts:7` imports `real-telemetry.ts` and `smooth.ts`.
- `smooth.ts` imports `three`.
- `index.ts:39` re exports the whole canvas.

Problems marked on that map:

- Circular imports. No hard TypeScript cycle was found. `src/track/*` never imports components. The costly loop is logical. `panels.tsx:3` imports `dashboard-canvas.tsx`. `index.ts:15` re exports both. Every edit re resolves the full subgraph.
- Duplicated logic. `boxSmooth` in `lap-metrics.ts` overlaps `sampleSeries` and `sampleTrace` and `samplePath` in `frame.ts`. Curvature math overlaps ribbon offset math in `ribbon.ts`. Pedal clamp logic repeats three times. Battery and tyre proxy formulas repeat in `metricsFromReal` and `buildPhysics`. Four `WeakMap` caches repeat the same pattern in `frame.ts:41`, `smooth.ts`, `ribbon.ts`, and `lap-metrics.ts`.
- Code in the wrong place. Geometry literals live in `.ts` logic files. Physics constants live in `lap-metrics.ts`. Fixture zones live in `section-maps.ts`. Palette tables live in `colormaps.ts` next to sampling code. Spa only playback constants live in `src/lib/telemetry.ts`. Module level `trackTelemetry('spa')` runs at import time. Deprecated `track-view-app.tsx:44` and `track-canvas.tsx:502` ship next to the current viewer.

Cause of the autocomplete freeze. The freeze comes from literal tuple types held in the main program, not from one slow function.

Evidence:

- `src/track/spa.ts:9` declares `center` as `readonly (readonly [number, number, number, number])[]` with about 2790 literal tuples. All 25 track files follow the same shape. Total track folder size is 1,471,493 bytes. Largest files are `spa.ts` at 76815 bytes and 2804 lines, `sochi.ts` at 66342 bytes, `suzuka.ts` at 63017 bytes.
- `src/track/catalog.ts:33` builds `TRACKS` with `as const satisfies readonly Track[]`. Line 61 derives `CatalogTrack` as `(typeof TRACKS)[number]`. This forces the checker to keep literal types for about 50000 tuples on every completion.
- `src/components/dashboard-canvas.tsx` is 126449 bytes and 3697 lines. It imports `catalog.ts`, `lap-metrics.ts`, `three`, and fiber. Any keystroke in dashboard state rechecks that graph.
- `src/components/dashboard/index.ts:39` re exports `Camera`, `CATALOG`, `Road`, and 15 more symbols from the canvas. Any import from the barrel loads the canvas plus all tracks.
- `tsconfig.json:25` includes `**/*.ts` and `**/*.tsx` with only `node_modules` excluded. `.next` is 885215727 bytes and is not excluded. Eight generated `.d.ts` files under `.next/dev/types` join the program. This widens every program load.

Commands that confirm the cause:

- `npx tsc --noEmit --extendedDiagnostics` shows program file count, type count, and check time before and after the fix.
- `npx tsc --noEmit --generateTrace traceDir` plus analysis with `@typescript/analyze-trace` shows which files own check time. Expect `spa.ts`, `catalog.ts`, and `dashboard-canvas.tsx` at the top.
- `npx tsc --noEmit --listFiles | Select-String ".next"` proves `.next` files join the program today and disappear after the include fix.
- A before and after autocomplete probe in the editor on `src/components/dashboard/store.tsx` measures the reported 100 second freeze against the fixed state.

Fix order. Move geometry literals out of `.ts` into JSON. Narrow `tsconfig` include to `src`. Drop `as const` literal retention in the catalog. Break the barrel import of the canvas. Each step is owned by unit U01.

## 3. Module audit table

Verdicts are keep, rebuild, merge, move, and delete. Delete means code with no purpose. Rebuild means write from goals without reading the old code.

| Path | Purpose | Smells found | Verdict | Reason |
|---|---|---|---|---|
| `src/track/frame.ts:115` | Planar frame types and arc sampling in meters. | `WeakMap` cache keyed by array identity. Small and clear. | Keep | Clean foundation. Add TSDoc units and branded IDs later. |
| `src/track/catalog.ts:95` | Registers 25 tracks and racelines. | Imports all tracks eagerly. `as const satisfies` retains 50000 literal types. Alias fixup for `mexico-city`. | Rebuild | Goal is a lazy registry. Inputs are track IDs. Output is `Track` and raceline. Smallest API is `trackById` plus `raceLineFor` plus `trackIds`. Load geometry on demand. |
| `src/track/spa.ts` plus 24 siblings | Centerline and raceline ground truth. | 928 to 2804 lines of numeric literals inside `.ts`. Construction mixed with data. | Move | Data is valid. Move rows to `src/track/data/geometry/<id>.json`. Keep a generated loader. Delete the `.ts` literals. |
| `src/track/real-telemetry.ts:55` | Real F1 traces for 3 tracks. | Static JSON imports. Hardcoded `BY_ID`. `as TrackTelemetry` cast on line 32. | Rebuild | Goal is typed telemetry access. Inputs are track ID. Output is `TrackTelemetry` or a typed missing value. Smallest API is `trackTelemetry` returning a `Result`. Validate JSON with a schema at the boundary. |
| `src/track/data/spa-telemetry.json` and siblings | Equal distance telemetry samples. | None. Real data. | Keep | Move path unchanged. Add schema validation. |
| `src/track/lap-metrics.ts:525` | Physics lap synthesis and metric ranges. | Long file. Inline constants `A_LAT0`, `V_MAX=94.5`. Duplicated battery and tyre proxies. Cache warming with `queueMicrotask`. Mixed abstraction levels. | Rebuild | Goal is pure lap math. Inputs are resampled centerline and optional real trace. Output is `LapMetrics` with meters per second and 0 to 1 pedals. Smallest API is `buildLapMetrics`, `sampleSeries`, `metricRange`, `formatMetricValue`. No React imports. No module level work. |
| `src/track/section-maps.ts:331` | Sector, ERS, and battery zones. | Fixture zones inline. `MAX=16` cap. Thresholds mixed with logic. | Merge | Works but is not standalone. Fold zone derivation into analysis behind one function. Keep fixture zones as JSON data. |
| `src/track/ribbon.ts:463` | Ribbon and stroke geometry builders. | Math heavy. `tangentAt` computed then recomputed. `sidesCache` repeats frame cache. No tests. | Keep | Geometry is correct and focused. Split only if it grows past 300 lines. Add characterization tests first. |
| `src/track/smooth.ts:50` | Catmull Rom resample with cache. | Imports `three` for pure math. `WeakMap` grows per spacing. | Merge | Small helper. Merge into analysis or geometry sampling. Remove `three` dependency with a local spline. |
| `src/track/colormaps.ts:227` plus `colormaps.json:64085` | Palette LUTs and sampling. | JSON import plus code in one module. `monoRamp(256)` generated at runtime. | Move | Palettes are data. Move tables to JSON. Keep a 30 line sampler. |
| `src/track/heatmap-presets.ts:43` | Metric to palette mapping. | None. Tiny and clear. | Keep | One reason to change. Keep as config. |
| `src/components/dashboard-canvas.tsx:3697` | Road, heatmap, sections, cars, hover, camera, panels, legends. | Oversized file. About 66 memo and frame hooks. Imperative refs. Magic numbers. Duplicated `fitTrack` logic. Exports 30 plus symbols at line 3824. | Rebuild | Goal is a thin scene composer. Inputs are `Track`, `LapMetrics`, and view state. Output is a React Three Fiber scene. Rebuild each piece from its visual goal. Do not copy the old file. Keep the old file pinned until the integration unit deletes it. |
| `src/components/dashboard/store.tsx:472` | Dashboard state provider. | About 30 `useState` calls. Render phase `setHoverClearedFor`. Huge memo dep list with eslint disable. Duplicate `fitTrackLocal`. | Rebuild | Goal is explicit dashboard state. Inputs are initial track and view. Output is state plus actions. Smallest API is one reducer plus selectors. No geometry math inside. |
| `src/components/dashboard/types.ts:125` | Shared dashboard types. | `derived.view: RefObject` leaks React refs into domain. Untyped `sizeRef` cast downstream. | Rebuild | Goal is the contract unit. Define branded `TrackId`, `Meters`, `Seconds` once. Use discriminated unions for view and layer state. This file becomes the foundation contract. |
| `src/components/dashboard/scene.tsx:180` | R3F canvas wiring. | `derived as` casts. Eslint disable for refs. Duplicated theme logic. | Rebuild | Goal is wiring only. Inputs are store state. Output is Canvas children. No business logic. |
| `src/components/dashboard/shell.tsx:96` | Provider plus scene plus loader. | `setGone` in render. Magic 600ms timeout. Boolean `controls` hides all panels. | Merge | Thin composer. Merge into one shell module with explicit props. |
| `src/components/dashboard/panels.tsx:81` | Adapter from store to panels. | Pure pass through. Re export churn. | Merge | No logic of its own. Merge into shell or controls module. |
| `src/components/dashboard/index.ts:62` | Public barrel. | Re exports the whole canvas. Pulls `three` and all tracks into every consumer. | Delete | Barrel has no purpose after the split. Import from direct paths. Justify deletion because deep imports replace it with no behavior loss. |
| `src/app/dashboard/page.tsx:14` | Playground route entry. | None. | Keep | Trivial server entry. Keep. |
| `src/app/dashboard/lap-comparison/page.tsx:18` | Real app route entry. | Hardcoded `controls=false`. Hardcoded `car1Visible:false`. | Keep | Entry is correct for a fresh start. Move flags into explicit route config in the foundation unit. |
| `src/app/dashboard/lap-comparison/chrome.tsx:246` | Floating docks and user bar. | Dead `CornerButton`. No op zoom and locate buttons. Repeated `useSyncExternalStore` boilerplate. Hardcoded avatar. | Rebuild | Goal is route chrome. Inputs are navigation callbacks and user state. Output is positioned controls. Smallest API is `BackButton`, `UserBar`, `BottomLeftControls` with real callbacks. No dead buttons. |
| `src/app/dashboard/lap-comparison/shell-client.tsx:34` | Client loader for the shell. | Duplicate loader fallback with `shell.tsx`. | Merge | Merge loader into the shell module. One loading pattern only. |
| `src/components/track-view-app.tsx:44` | Deprecated root view. | Marked deprecated. Hardcoded `spa` and blue line. | Keep | User asked to keep unused components. Judge as low quality. Rebuild only when reused. Isolate from the app graph. |
| `src/components/track-canvas.tsx:502` | Older ortho track view. | Superseded by dashboard canvas. Module global raycaster. Side effects in effects. | Keep | User asked to keep unused components. Judge as usable reference for simple ortho views. Isolate from the app graph. |
| `src/components/playback-context.tsx:273` | Lap playback with keyboard and rate. | Three contexts plus mutable export. Global key handler. | Rebuild | Goal is playback state. Inputs are lap duration in milliseconds. Output is time ratio and actions. Rebuild as one reducer when lap comparison needs it. |
| `src/components/telemetry-chart.tsx:419` | ECharts speed and delta chart. | Heavy chart dependency for one chart. Imperative handle. | Keep | Works and may serve lap comparison. Judge as heavy but functional. Wrap behind a chart contract so a lighter chart can replace it. |
| `src/components/telemetry-dock.tsx:193` | Chart tabs and transport. | `useMemo` identity workaround is honest. Split subscribers are good. | Keep | Works. Keep until lap comparison defines its dock. |
| `src/components/timeline-scrubber.tsx:464` | Scrubber with hover tip portal. | Large animation logic. 464 lines for one control. | Rebuild | Goal is a scrubber. Inputs are 0 to 1 ratio and callbacks. Output is pointer events. Rebuild from interaction goals when needed. |
| `src/components/toolbar.tsx:108` | Pill tab bar. | Shared `layoutId` can collide across instances. | Keep | Small and reusable. Fix `layoutId` on reuse. |
| `src/components/top-bar.tsx:93` | Deprecated toolbar. | Local state only. Dead menus. | Keep | Unused but kept per instruction. Isolate. |
| `src/components/map-focus.tsx:25` | Focus lock context. | None. | Keep | Tiny and clear. |
| `src/components/icon-button.tsx:36` | Shared icon button. | None. | Keep | Tiny and clear. |
| `src/components/ui/avatar.tsx`, `dropdown-menu.tsx`, `select.tsx` | Vendored shadcn wrappers. | None. | Keep | Vendored UI. Do not touch. |
| `src/lib/telemetry.ts:176` | Spa only playback series. | Module level `trackTelemetry('spa')`. Throws if missing. Fake `SECTORS` unrelated to `section-maps.ts`. Spa only. | Rebuild | Goal is lap comparison data access. Rebuild as track agnostic selectors over `LapMetrics`. Delete Spa globals. Code works but is not useful beyond one demo. |
| `src/lib/utils.ts` | Re exports `cn`. | None. | Keep | One line. Keep. |
| `src/lib/quiet-three-clock-warning.ts:33` | Filters Three.js clock warning. | Global console patch. Guarded once. | Keep | Works. Keep isolated in view layer. |
| `src/lib/hover-tip-animation.ts` | Hover spring helpers. | Read briefly. Animation only. | Keep | Keep with scrubber. Reassess on rebuild. |
| `scripts/build-tracks.mjs:156` | Generates track modules from CSV. | Writes `.ts` literals. This is the freeze generator. | Keep | Keep script. Change output to JSON plus a small loader. |
| `scripts/fetch-f1-telemetry.py` | Fetches FastF1 telemetry. | Not read in full. Boundary script. | Keep | Keep. Add schema check on output. |

Code that works but is not useful. `src/lib/telemetry.ts` Spa globals work but serve one demo. `top-bar.tsx` menus render but do nothing. `chrome.tsx` zoom and locate buttons render but are no ops. `track-view-app.tsx` renders but is deprecated. These stay isolated per the keep unused instruction but must not join the app bundle.

## 4. Target architecture

Layers run one way. Data, then domain types, then pure analysis, then state, then UI. No layer imports upward.

Proposed layers with justification:

- `data`. Static JSON, CSV outputs, constants, fixtures, schemas. Justification is that data changes on a different rhythm than logic. Geometry updates come from TUMFTM. Telemetry comes from FastF1. Palettes come from design. None of these should trigger logic edits.
- `domain`. Branded types, units, discriminated unions, schemas. Justification is that every future feature needs the same words for meters, seconds, track IDs, and lap fractions. One file owns the words.
- `analysis`. Pure functions over `Track` and telemetry. Justification is testability. Physics, sections, ranges, and formatting run without React, Three.js, or the router.
- `state`. Reducers and selectors for dashboard and lap comparison. Justification is that UI state churns fast. Reducers keep transitions explicit and testable.
- `ui`. React Three Fiber scene pieces and DOM chrome. Justification is that rendering changes for visual reasons. It consumes state but never computes physics.

Import rule that enforces the direction. Add an ESLint rule with `eslint-plugin-import` or a `dependency-cruiser` config. Rule text is short. `data` imports nothing internal. `domain` imports `data` schemas only. `analysis` imports `domain` and `data`. `state` imports `domain` and `analysis`. `ui` imports `state`, `analysis`, `domain`, `data`. No imports from `ui` into `state` internals. No imports from `analysis` into `ui` or `state`. No barrel re exports across layers. The foundation unit adds this config and a test that fails on violation.

Organize by feature. `lap-comparison` is self contained under `src/app/dashboard/lap-comparison` plus `src/features/lap-comparison`. Shared track viewer pieces live under `src/features/viewer`. Playground code stays under `src/app/dashboard` and `src/features/playground`. Code moves from playground to app by promotion. A playground piece graduates only when it has a contract, tests, and docs. It is copied into the feature folder through the contract, not imported from the playground. The playground can import shared code. Shared code never imports the playground.

How to add each extension:

- New data source. Add JSON under `src/track/data/<source>/`. Add a Zod or Valibot schema under `domain`. Add one loader function that returns a `Result`. Add fixtures under `analysis/__fixtures__`. No logic file edits outside the loader and registry.
- New metric. Add the metric ID to the domain union. Add one pure computer in `analysis`. Add range and format entries. Add a palette preset entry. UI picks it up through the metric contract. No scene edits.
- New chart. Add a component under the feature folder that consumes `LapMetrics` series through selectors. It does not import ECharts internals elsewhere. Chart mode stays a discriminated union.

Conventions:

- File size. Soft limit 250 lines. Hard review trigger at 400 lines. One component or one pure module per file.
- Naming. Booleans read as questions. Functions are verb plus noun. Collections are plural. Units appear in names or TSDoc. Files are kebab case. Types are PascalCase.
- TSDoc. Every export gets one short contract with units. Meters or kilometers. Seconds or milliseconds. Kilometers per hour for display speed. Comments state why only. Delete what comments.
- Error handling. Parse at the boundary with schemas. Return `Result<T, DomainError>` or throw a typed error, one pattern per layer. Never `null` or `undefined` as a signal. Never error codes. Never `any`. Never unchecked casts.
- Tests. Colocate as `*.test.ts` next to the module. Characterization tests pin current behavior before a rebuild. Test first tests define rebuilt contracts. Test public outputs, not internals.

Final folder tree:

```text
src/
  app/
    dashboard/
      page.tsx
      lap-comparison/
        page.tsx
        chrome.tsx
        shell-client.tsx
  features/
    viewer/
      road.tsx
      racing-line.tsx
      heatmap-road.tsx
      section-road.tsx
      item-car.tsx
      hover-probe.tsx
      camera.tsx
      shell.tsx
      panels.tsx
    lap-comparison/
      store.ts
      selectors.ts
      delta-chart.tsx
      comparison-scene.tsx
    playground/
      debug-panels.tsx
  track/
    data/
      geometry/<id>.json
      telemetry/<id>.json
      palettes.json
      section-fixtures.json
    domain.ts
    catalog.ts
    lap-metrics.ts
    sections.ts
    ribbon.ts
    colormaps.ts
  lib/
    result.ts
    format.ts
  components/
    ui/
```

Dependency diagram:

- `app` imports `features` and `state`.
- `features/viewer` imports `state`, `analysis`, `domain`, `data`.
- `features/lap-comparison` imports `state`, `analysis`, `domain`.
- `state` imports `analysis` and `domain`.
- `analysis` imports `domain` and `data`.
- `domain` imports `data` schemas.
- `data` imports nothing internal.

## 5. Rejected alternatives

Alternative A. Keep `.ts` geometry and fix only `tsconfig`. Rejected because literal tuple types stay in the program. `catalog.ts:61` keeps a 50000 member literal union. Autocomplete stays slow. Build stays slow. Data stays mixed with logic.

Alternative B. One shared core with deep barrels. Rejected because barrels caused the fan out. `index.ts:39` proves the cost. Deep direct imports are faster to resolve and easier to trace. One barrel per feature is still a choke point.

Alternative C. Full state library now. Rejected because two reducers cover the need. Dashboard state and lap comparison state are small. A library adds layers without a second concrete use. The plan justifies each abstraction. This one has no justification yet.

Alternative D. Eager load all tracks with virtualized rendering. Rejected because geometry is 1.4 MB of source and grows with each track. Lazy load by ID is simpler. Virtualization has no measurement behind it. Optimize after measuring per principle 13.

Alternative E. Rewrite the canvas in place. Rejected because a 3697 line file cannot be rewritten safely without pins. The plan keeps the old canvas pinned, builds thin pieces against contracts, then deletes the old file in the integration unit. This follows the verifiable units rule.

## 6. Work units and the dependency table

Rules honored. No two units own the same file. Routes and configs belong to U01 or U09. Shared contracts live in U01. Each unit builds and passes tests alone in dependency order. Each unit caps at about 15 files.

### U01. Foundation contracts, safety net, and editor fix

Goal. Define shared contracts and unfreeze autocomplete.

Depends on. None. All other units depend on this.

Owned paths. `tsconfig.json`, `eslint.config.mjs`, `.dependency-cruiser.cjs` or equivalent, `src/track/domain.ts`, `src/lib/result.ts`, `src/track/data/geometry/*.json`, `src/track/data/telemetry/*.json`, `src/track/data/palettes.json`, `scripts/build-tracks.mjs`, `tests/characterization/*`, `scripts/measure-tsc.mjs`.

Forbidden paths. `src/components/dashboard-canvas.tsx`, `src/components/dashboard/*`, `src/app/dashboard/**/*`, `src/track/lap-metrics.ts`, `src/track/ribbon.ts`.

Contracts consumed. None.

Contracts produced. `TrackId`, `Meters`, `Seconds`, `LapFraction`, `Track`, `TrackSample`, `LapMetrics`, `MetricId`, `SectionZone`, `Result<T, DomainError>`, `trackById`, `raceLineFor`, `trackTelemetry`, loader signatures.

Tasks in order:

1. Narrow `tsconfig.json:25` include to `src/**/*.ts`, `src/**/*.tsx`, `next-env.d.ts`. Exclude `node_modules` and `.next`.
2. Change `scripts/build-tracks.mjs:75` to emit `src/track/data/geometry/<id>.json` plus a tiny loader. Keep CSV parsing unchanged.
3. Move all 25 center and race arrays to JSON. Delete literals from `src/track/*.ts`. Keep thin re export shims only if imports demand it during migration.
4. Move `colormaps.json` rows and `section-maps.ts` fixtures to `src/track/data/`. Keep samplers in code.
5. Write `src/track/domain.ts` with branded types, units in TSDoc, discriminated unions, and Zod schemas for geometry and telemetry JSON.
6. Write `src/lib/result.ts` with one `Result` type and typed errors.
7. Rewrite `src/track/catalog.ts` as a lazy registry with `trackById` and `raceLineFor`. Remove `as const` literal retention.
8. Add import boundary rule config plus a failing test on violation.
9. Add characterization tests for `samplePath`, `lapMetrics`, `resolveSectionMap`, `ribbonPositions`, and catalog lookup. Capture `pin-dashboard-contract` output as baseline.
10. Add `scripts/measure-tsc.mjs` that runs `tsc --extendedDiagnostics` and records program files and check time.

Tests to write or keep passing before the change. New characterization tests. Existing build passes. `npx tsc --noEmit` passes.

Acceptance criteria. Build passes. Type check passes. Tests pass. `any` does not appear in owned paths. No what comments remain. No inline data remains in owned logic files. `tsc --extendedDiagnostics` shows program file drop and check time drop. Editor autocomplete on `store.tsx` responds without a freeze. `tsc --listFiles` shows no `.next` files.

Rollback. Revert U01 commit. Geometry JSON stays on disk but unused. Old `.ts` literals restore from git. Rerun `tsc --noEmit`.

### U02. Pure analysis rebuild

Goal. Rebuild lap math as pure functions.

Depends on. U01 contracts.

Owned paths. `src/track/lap-metrics.ts`, `src/track/sections.ts`, `src/track/smooth.ts`, `src/track/colormaps.ts`, `src/track/heatmap-presets.ts`, `src/track/analysis/__fixtures__/*`, adjacent `*.test.ts`.

Forbidden paths. `src/track/domain.ts`, `src/track/catalog.ts`, `src/track/data/*`, `src/components/**/*`, `src/app/**/*`, `src/lib/result.ts`.

Contracts consumed. `Track`, `LapMetrics`, `MetricId`, `Result`, schemas from U01.

Contracts produced. `buildLapMetrics`, `sampleSeries`, `metricRange`, `formatMetricValue`, `seriesFor`, `resolveSections`.

Tasks in order:

1. Write test first specs for `buildLapMetrics` from goals. Inputs are resampled centerline in meters and optional real trace. Outputs are speed in meters per second and pedals 0 to 1.
2. Rebuild physics without reading the old file. Extract named constants with units.
3. Merge `smooth.ts` spline into analysis without `three`. Merge `section-maps.ts` derivation behind `resolveSections`.
4. Keep `ribbon.ts` untouched. Keep `colormaps.ts` sampler tiny.
5. Deduplicate pedal clamp and battery proxy into one helper each.

Tests. New unit tests for physics ranges, real trace path, missing telemetry path, section caps, formatting units.

Acceptance criteria. Build passes. Type check passes. Tests pass. No `any`. No what comments. No inline fixture data. No `three` import in analysis. Benchmark in section 7 recorded for 25 tracks.

Rollback. Revert U02 commit. U01 contracts stay. Old analysis restores from git.

### U03. Geometry and paint layer

Goal. Isolate ribbon and palette sampling behind tested contracts.

Depends on. U01 contracts. Logically after U02 but can run in parallel if it codes against U01 contracts only.

Owned paths. `src/track/ribbon.ts`, `src/track/colormaps.ts` sampler part, adjacent `*.test.ts`.

Forbidden paths. `src/track/lap-metrics.ts`, `src/track/sections.ts`, `src/track/domain.ts`, `src/components/**/*`.

Contracts consumed. `Track`, `Xy`, palette types from U01.

Contracts produced. `ribbonPositions`, `ribbonHeatmap`, `strokePositions`, `samplePalette`, geometry input and output shapes.

Tasks in order:

1. Add characterization tests for current ribbon outputs on spa and monza.
2. Remove duplicate tangent computation. Unify `offsetPolyline` and `trackSides`.
3. Replace module caches with explicit function args or one documented cache with size bound.
4. Shrink `colormaps.ts` to sampler plus preset lookup.

Tests. Characterization tests plus new edge tests for closed rings and short tracks.

Acceptance criteria. Build passes. Tests pass. No `any`. Outputs match baseline within tolerance. No inline palette data.

Rollback. Revert U03 commit.

### U04. Viewer scene split

Goal. Replace the canvas monolith with thin scene pieces.

Depends on. U01, U02, U03.

Owned paths. `src/features/viewer/road.tsx`, `racing-line.tsx`, `heatmap-road.tsx`, `section-road.tsx`, `item-car.tsx`, `hover-probe.tsx`, `camera.tsx`, `shell.tsx`, `panels.tsx`, adjacent tests.

Forbidden paths. `src/components/dashboard-canvas.tsx`, `src/components/dashboard/*`, `src/app/**/*`, `src/track/**/*`.

Contracts consumed. Domain types, analysis functions, geometry selectors.

Contracts produced. Viewer component props. Each piece takes plain props with units. No hidden store imports.

Tasks in order:

1. Write visual and contract tests for each piece against fixtures. Test props and visible output.
2. Rebuild each piece from its visual goal without reading `dashboard-canvas.tsx`. Road shows the closed ring. Racing line shows the fast path. Heatmap paints one metric. Sections paint zones. Car places a pose. Hover shows a readout. Camera fits bounds.
3. Keep functions 5 to 20 lines. Split only when the name says more than the code.
4. Keep the old canvas file untouched as the behavior pin.

Tests. Component tests with fixtures. No snapshot of internals.

Acceptance criteria. Build passes. Tests pass. No `any`. Each file under 250 lines. No physics in UI files. No `three` math duplicated from analysis.

Rollback. Delete `src/features/viewer/*`. Old canvas still serves routes.

### U05. Dashboard state rebuild

Goal. Replace the dashboard store with an explicit reducer.

Depends on. U01, U02.

Owned paths. `src/features/playground/store.ts`, `selectors.ts`, `src/features/playground/debug-panels.tsx`, adjacent tests.

Forbidden paths. `src/components/dashboard/*`, `src/components/dashboard-canvas.tsx`, `src/features/viewer/*`, `src/track/**/*`.

Contracts consumed. Domain types and analysis selectors.

Contracts produced. Playground `State`, `Action`, `reducer`, selectors for view, layers, hover, and metrics source.

Tasks in order:

1. Write test first transitions for track select, orientation change, layer toggle, hover set and clear, camera fly to.
2. Rebuild as one reducer plus selectors. Remove 30 `useState` calls. Remove render phase setters. Remove eslint disables.
3. Rebuild debug panels from display goals.

Tests. Reducer transition tests. Selector tests.

Acceptance criteria. Build passes. Tests pass. No `any`. No render phase state sets. No geometry math in state.

Rollback. Revert U05 commit. Old store still serves old routes.

### U06. Lap comparison feature

Goal. Build the real app slice against contracts.

Depends on. U01, U02, U03, U04.

Owned paths. `src/features/lap-comparison/store.ts`, `selectors.ts`, `delta-chart.tsx`, `comparison-scene.tsx`, `src/app/dashboard/lap-comparison/shell-client.tsx`, `chrome.tsx`, adjacent tests.

Forbidden paths. `src/components/dashboard-canvas.tsx`, `src/components/dashboard/*`, `src/features/viewer/*`, `src/track/**/*`, `src/app/dashboard/page.tsx`.

Contracts consumed. Domain, analysis, viewer props.

Contracts produced. Lap comparison state, delta selectors in seconds, chart props.

Tasks in order:

1. Write test first specs for delta math and two lap selection. Inputs are two `LapMetrics`. Output is per distance delta in seconds.
2. Rebuild `chrome.tsx` from goals with real callbacks. Delete dead buttons or wire them.
3. Merge `shell-client.tsx` loader into one pattern. Compose viewer pieces with comparison state.
4. Wrap `telemetry-chart.tsx` behind a chart contract. Do not fork the chart library.

Tests. Delta math tests. Store transition tests. Route smoke test.

Acceptance criteria. `/dashboard/lap-comparison` builds and renders two laps with delta. No `any`. No Spa globals. No dead buttons.

Rollback. Revert U06 commit. Route falls back to prior shell.

### U07. Playback and timeline rebuild

Goal. Provide explicit playback for comparison when needed.

Depends on. U01, U06.

Owned paths. `src/features/lap-comparison/playback.ts`, `src/components/timeline-scrubber.tsx` replacement under features, `src/lib/hover-tip-animation.ts` if touched, adjacent tests.

Forbidden paths. `src/components/playback-context.tsx`, `src/components/telemetry-dock.tsx`, `src/track/**/*`.

Contracts consumed. Lap duration in milliseconds and 0 to 1 ratios.

Contracts produced. Playback reducer, `timeRatio` selectors, scrubber props.

Tasks in order:

1. Write transition tests for play, pause, rate change, jump, and hover suppress.
2. Rebuild playback as one reducer. Remove triple context and mutable export.
3. Rebuild scrubber from interaction goals. Keep animation code only if measured smooth.

Tests. Reducer tests. Scrubber pointer tests.

Acceptance criteria. Build passes. Tests pass. Scrubber stays in sync with playback at 60 fps on spa fixtures or the miss is logged as a follow up.

Rollback. Revert U07 commit. Old playback context remains isolated.

### U08. Legacy isolation and dead code removal

Goal. Isolate kept experiments and delete code with no purpose.

Depends on. U04, U05, U06.

Owned paths. `src/components/track-view-app.tsx`, `src/components/track-canvas.tsx`, `src/components/playback-context.tsx`, `src/components/telemetry-dock.tsx`, `src/components/telemetry-chart.tsx`, `src/components/top-bar.tsx`, `src/components/toolbar.tsx`, `src/lib/telemetry.ts` legacy path, `src/components/dashboard/index.ts` deletion.

Forbidden paths. All `src/features/**/*`, `src/track/domain.ts`, `src/track/catalog.ts`, `src/track/data/*`, `src/app/**/*`.

Contracts consumed. None new. Must not import new contracts.

Contracts produced. None. This unit produces isolation only.

Tasks in order:

1. Move deprecated viewer files under `src/components/legacy/` or mark with an isolation header. Ensure no app route imports them.
2. Delete `src/components/dashboard/index.ts` barrel. Fix imports to deep paths.
3. Delete `src/lib/telemetry.ts` Spa globals after U06 replaces consumers. Justify each deletion with no purpose or full replacement.
4. Run bundle check to prove legacy files do not join app routes.

Tests. Keep passing. Add an import graph test that fails if app routes import legacy.

Acceptance criteria. Build passes. Tests pass. No app route bundles legacy files. Deletions listed with reasons.

Rollback. Revert U08 commit.

### U09. Integration and old path removal

Goal. Remove the old canvas and verify the whole.

Depends on. U04, U05, U06, U07, U08.

Owned paths. `src/components/dashboard-canvas.tsx` deletion, `src/components/dashboard/*` deletion or shim, `src/app/dashboard/page.tsx`, route configs, docs for promotion from playground to app.

Forbidden paths. None. This unit owns final wiring only. It must not change logic in `src/features/*` or `src/track/*` except imports.

Contracts consumed. All contracts.

Contracts produced. Final route map and promotion guide.

Tasks in order:

1. Point `/dashboard` at the new viewer plus playground store.
2. Point `/dashboard/lap-comparison` at the new comparison feature.
3. Delete `dashboard-canvas.tsx` and old `dashboard/*` after routes pass.
4. Run full build, type check, tests, lint, import boundary check, and section 7 benchmarks.
5. Write the one page promotion guide. Playground to app steps only.

Tests. Full suite. Route smoke tests. Contract pin comparison.

Acceptance criteria. Build passes. Type check passes. Tests pass. No `any` in `src`. No what comments. No inline data in logic. Old monolith gone. Bundle size and `tsc` time recorded.

Rollback. Restore deleted files from git. Repoint routes to prior imports. One revert commit.

### Dependency table. Who can run together

| Unit | Depends on | Can run in parallel with |
|---|---|---|
| U01 | None | None. Runs first. |
| U02 | U01 | U03 if both code against U01 contracts only. |
| U03 | U01 | U02 for the same reason. |
| U04 | U01, U02, U03 | U05, U07 planning and tests. Not implementation. |
| U05 | U01, U02 | U03, U04 implementation on separate paths. |
| U06 | U01, U02, U03, U04 | U05, U08 planning. Not implementation. |
| U07 | U01, U06 | U08 on separate paths. |
| U08 | U04, U05, U06 | U07 on separate paths. |
| U09 | U04, U05, U06, U07, U08 | None. Runs last. |

Parallel work must code against U01 contracts, not against other units in flight. If a contract needs a change, update U01 first then resume.

## 7. Measurements to take, only those that guard a decision

- `npx tsc --noEmit --extendedDiagnostics` before U01 and after U01 and after U09. Guards the freeze fix. Record program files, type count, check time.
- `npx tsc --noEmit --generateTrace traceDir` before and after U01. Guards which files own check time. Confirm `spa.ts`, `catalog.ts`, and `dashboard-canvas.tsx` drop out.
- `npx tsc --noEmit --listFiles` filtered for `.next`. Guards the include fix.
- Editor autocomplete timing on `store.tsx`. Manual probe before and after U01. Guards the 100 second claim.
- `npm run build` time and route prerender output for `/dashboard` and `/dashboard/lap-comparison` after U04, U06, U09. Guards that splits did not break routes.
- Analysis benchmark. Build `LapMetrics` for all 25 tracks and record milliseconds after U02. Guards whether memoization or workers are needed. Default is defer unless one track exceeds 200 ms on a laptop.
- Bundle check. `next build` output size for both routes after U06 and U09. Guards lazy loading. Defer virtualization and code splitting beyond route level unless telemetry JSON pushes a route past budget.
- Scrubber frame check after U07. Manual scrub on spa fixture. Guards animation keep or cut. No profiling harness beyond this unless jank is visible.

Deferred by default. Typed arrays beyond existing `Float64Array` use. Memoization beyond selectors. Web workers. Virtualization. Lazy loading beyond track geometry. Each needs a number from the list above before it earns a place.

## 8. Risks, open questions, and assumptions

Risks:

- The 3697 line canvas hides behavior with no tests. Characterization pins in U01 reduce the risk. Keep the old file until U09.
- `lap-metrics.ts:525` physics constants have no cited source. Values like `V_MAX=94.5` and brake 32 may encode real tuning. Pins plus fixtures preserve them. Do not retune physics in this refactor.
- Real telemetry covers 3 of 25 tracks. The other 22 use physics plus mistake windows. Keep the fallback explicit in the contract. Do not hide missing data.
- TUMFTM geometry is LGPL-3.0. Moving rows to JSON keeps the license header requirement. Keep attribution in each JSON file and in `scripts/build-tracks.mjs:1`.
- `three` leaks into analysis through `smooth.ts`. Removal needs a local spline with tolerance tests. Risk is visual drift. Pin resample outputs first.

Open questions:

- Which unused components will actually return. `track-view-app.tsx`, `track-canvas.tsx`, `telemetry-dock.tsx`, and `timeline-scrubber.tsx` are kept but isolated. The plan does not rebuild them until a feature needs them. Is isolation enough or should they move out of `src` entirely.
- Chart standard. `telemetry-chart.tsx:419` pulls ECharts for one chart. Should lap comparison stay on ECharts or move to a lighter chart behind the new contract.
- Playback scope. Lap comparison starts with `car1Visible:false` in `page.tsx:12`. Does the first real version need full playback or only static delta. U07 waits on this answer.
- `interrogate` review was single model only in this session. A second pass with diverse models should cross examine this plan before U01 starts.

Assumptions:

- I read every file under `/dashboard` and `/dashboard/lap-comparison` and one level of imports. I sampled track geometry files by head plus `catalog.ts` in full. I did not read every one of the 25 geometry files line by line. Line counts and shapes come from measured sizes plus `build-tracks.mjs`.
- `scripts/fetch-f1-telemetry.py` and `scripts/tumftm` were listed but not fully read. Telemetry JSON shape comes from `real-telemetry.ts` and the three JSON files.
- `decisions.tsv:1` shows prior work scoped this as a medium high rigor refactor with a blocks preview route. That route was not present in this tree. I assume it was removed or uncommitted.
- Git history has 5 commits. `why` evidence is thin. Intent after `b9f2b1b` is inferred from code shape and comments, not from tickets or docs.
- No behavior tests exist today. U01 creates the first pins. Later units assume those pins hold.
