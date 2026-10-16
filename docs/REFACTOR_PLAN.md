# Refactor plan. Trackview v2

## Progress log

### Batch 1 — U01 Foundation (2026-10-16)

**Status.** Done. Build, `tsc`, pins, and `npm test` green.

**What changed.**

| Area | Change |
|---|---|
| Geometry | `build-tracks.mjs` emits `src/track/data/geometry/<id>.json`. Deleted 24 literal `src/track/<circuit>.ts` modules. Thin `spa.ts` re-export kept for legacy `track-view-app.tsx`. |
| Catalog | Rebuilt as lazy registry: `listTrackIds`, `trackById`, `raceLineFor`. No static import of all geometry. `TRACKS` / `RACE_LINES` are Proxies that load on first access (back-compat for playground). Removed unused `CatalogTrack`. |
| Domain | Added `src/track/domain.ts` (`TrackFile`, `parseTrack`, `MetricId`, `LapMetrics` type, `SectionZone`, brands, `parseTelemetry`) and `src/lib/result.ts`. |
| Telemetry | Moved JSON to `src/track/data/telemetry/{spa,monza,texas}.json`. `real-telemetry.ts` exposes `loadTelemetry` → `Result` plus sync `trackTelemetry` for U02. |
| Fixtures | `colormaps.json` → `data/palettes.json`. Static section zones → `data/section-fixtures.json` (resolver still in `section-maps.ts`). |
| Tooling | Narrowed app `tsconfig` include to `src/**` (+ Next re-adds `.next/types`). Added `tsconfig.measure.json` (no `.next`) for freeze metrics. Vitest + `npm test`. `scripts/measure-tsc.mjs`. Pin uses spa-only `trackById`. |
| Tests | `catalog.test.ts`, `real-telemetry.test.ts` (9 tests). |

**Deferred (still U01 scope, not blocking).**

- `dependency-cruiser` / eslint boundaries — freeze fix outranked; add in a follow-up commit if wanted.
- Zod — only two hand parsers; not earned yet.

**Measurements (`tsconfig.measure.json`, `--incremental false`).**

| Metric | Before (plan §2) | After U01 |
|---|---|---|
| Lines of TypeScript | ~58,968 | 10,301 |
| Types | ~238k | 47,112 |
| Instantiations | ~154k | 154,178 |
| Memory | ~560 MB | ~515 MB |
| Total time | ~10.9s | ~5.45s |
| Geometry `.ts` literals in program | 25 giant modules | gone (`spa.ts` thin only) |
| Geometry JSON in program | n/a | **0** (lazy `require` context) |
| `.next` in measure project | polluted via `**/*` include | none (`tsconfig.measure.json` skips `next-env.d.ts`) |

Pin output matches `scripts/pin-dashboard-contract.baseline.json` unchanged.

**Acceptance checklist.**

- [x] Build / `tsc` / pins / `npm test`
- [x] No `any` in owned paths
- [x] No inline geometry in owned logic
- [x] Lazy catalog invariant (no static all-geometry import)
- [x] `MetricId` lives in `domain.ts` before U02
- [x] Editor autocomplete on `store.tsx` — deferred to U05; closed in Batch 5 (`playground/store.ts`, no canvas import)

**Next batch.** U02 (pure analysis) and/or U03 (ribbon/palettes) in parallel on U01 contracts.

### Batch 2 — U02 Pure analysis (2026-10-16)

**Status.** Done (U02 only). Build, `tsc`, pins, and `npm test` green. U03 deferred (disjoint but left for a follow-up session).

**What changed.**

| Area | Change |
|---|---|
| Resample | `smooth.ts` — local closed Catmull-Rom (tension 0.5) + arc-length map matching former `THREE.CatmullRomCurve3`. No `three` import. Spa pin digests unchanged. |
| Lap metrics | Rebuilt with named constants (units in names/TSDoc), shared pedal/battery/tyre helpers, `buildLapMetrics` + cached `lapMetrics` alias. Uses `loadTelemetry`. Re-exports `MetricId` / `LapMetrics` from `domain.ts`. |
| Sections | New `sections.ts` (`resolveSections` + `resolveSectionMap` alias). Consumes existing `data/section-fixtures.json`. `section-maps.ts` is a thin compat re-export. |
| Presets | `heatmap-presets.ts` — one-line `MetricId` import redirect to `domain.ts`. |
| Tests | Characterization pins in `__fixtures__/analysis-pins.json`. `smooth.test.ts`, `lap-metrics.test.ts`, `sections.test.ts` (17 tests total with U01). |

**Commands run.**

- `npm test` — 17 passed
- `npx tsc --noEmit` — clean
- `npm run pin` — matches `scripts/pin-dashboard-contract.baseline.json`
- `npm run build` — green

**Deferred / notes.**

- U03 (ribbon + palette sampler characterization / dead-export cleanup) — next; paths remain free except `heatmap-presets` MetricId redirect already taken by U02.
- `lap-metrics.ts` still ~490 lines (soft limit ~250). Split into physics submodule later if needed; helpers are already deduped.
- Monza physics speed digest updated after dropping `three` (float ulp on mid samples). Spa resample/metrics/pin digests unchanged. Auto (FastF1) digests for spa/monza unchanged.

**Acceptance checklist.**

- [x] `npm test` / `tsc` / pin / build
- [x] No `three` in `lap-metrics` / `sections` / `smooth`
- [x] No `any` in owned paths
- [x] Compat aliases `lapMetrics` + `resolveSectionMap`
- [x] Section fixtures from JSON (not inlined)
- [ ] U03 — not in this batch

**Next batch.** U03 (ribbon / palettes), then U04 viewer split.

### Batch 3 — U03 Ribbon + palette sampler (2026-10-16)

**Status.** Done. Build, `tsc`, pins, and `npm test` green.

**What changed.**

| Area | Change |
|---|---|
| Ribbon | Removed dead `edgeLoops` export. Documented `sidesOf` WeakMap cache (GC-bound to `Track` identity). Formatting / structure cleanup; geometry math unchanged. |
| Palettes | Sampler stays thin over `data/palettes.json`. Replaced `as unknown as` with `parseScientificTables` + RGB/LUT guards. Deleted leftover `src/track/colormaps.json`. |
| Presets | Untouched — MetricId redirect already landed in U02. |
| Tests | `ribbon.test.ts`, `colormaps.test.ts` + `__fixtures__/ribbon-pins.json`, `palette-pins.json` (spa/monza ribbon + key palette samples). |

**Commands run.**

- `npm test` — 22 passed
- `npx tsc --noEmit` — clean
- `npm run pin` — matches baseline
- `npm run build` — green

**Deferred / notes.**

- `ribbon.ts` still ~420 lines (review threshold). Further split only if U04 viewer extract needs it.
- Procedural mono/tyre LUTs remain in TS (generated); scientific tables stay in JSON.

**Acceptance checklist.**

- [x] Characterization tests spa/monza ribbon
- [x] Dead export removed (`edgeLoops`)
- [x] Cache documented / WeakMap-bound
- [x] Sampler over `palettes.json`, no `any`
- [x] Pin / `tsc` / build / tests

**Next batch.** U04 viewer scene split.

### Batch 4 — U04 Viewer scene split (2026-10-16)

**Status.** Done. Build, `tsc`, pins, and `npm test` green. Canvas untouched (runtime pin until U09).

**What changed.**

| Area | Change |
|---|---|
| Contracts | `src/features/viewer/contracts.ts` — catalogs + `View` / `RoadProps` / hover types matching canvas export surface. |
| Math | `math.ts` — center/orient/fit/pose/place/paint digests; no scene graph. |
| Scene | `road.tsx` (buffers + instant layer opacity), `racing-line.tsx`, `item-car.tsx`, `rig.tsx` (Grid/Camera/SizeProbe), `hover-probe.tsx`, `shell.tsx` (`ViewerScene` + tip overlay). |
| Barrel | `index.ts` re-exports canvas-parity scene + math surface for U05/U06. |
| Tests | `math.test.ts` pins spa bounds `d00913c7bae8c334`, pose `2b47793ed1e8ac7a`, heat `ab231c5ecbf285c4`, asphaltN `125514`. |

**Commands run.**

- `npm test` — 25 passed
- `npx tsc --noEmit` — clean
- `npm run pin` — matches baseline
- `npm run build` — green

**Deferred / notes.**

- Road omits canvas crossfade / morph animation (instant opacity). Digests cover buffers, not fade timing. Full animation stays on canvas until U09.
- Soft line budget: `road.tsx` ~370, `hover-probe.tsx` ~450, `rig.tsx` ~360 — measured overflows; no further split this batch (heatmap-road / section-road / camera.tsx deferred).
- Panels (`DebugPanel`, legends, `StateProbe`) stay on canvas → U05 playground.

**Acceptance checklist.**

- [x] Build / `tsc` / pins / `npm test`
- [x] Digests for bounds, heatmap sample, car pose
- [x] No physics inside viewer files
- [x] No writes to `dashboard-canvas.tsx` / `dashboard/*` / `app/**` / `track/**`
- [x] Canvas remains runtime pin until U09

**Next batch.** U05 playground state rebuild (depends on U04 contracts).

### Batch 5 — U05 Playground state rebuild (2026-10-16)

**Status.** Done. Build, `tsc`, pins, and `npm test` green. `/dashboard` still on `DashboardCanvas` (U09).

**What changed.**

| Area | Change |
|---|---|
| Store | `src/features/playground/store.ts` — pure `State` / `Action` / `reducer`, selectors (`selectTrack`, `selectRacePath`, `selectFollow`, `selectZones`, …), `PlaygroundProvider` with imperative view fit/focus via viewer helpers. No geometry math in the reducer; no `dashboard-canvas` import. |
| Panels | `panels.tsx` — lean `DebugPanel` / `ItemsPanel` / legends dispatching Actions. Track picker uses `listTrackIds()` (lazy); selected name from `derived.track`. |
| Shell | `shell.tsx` — Canvas + `ViewerScene` + controls + `ViewerHoverOverlay` + loader. Local `StateProbe` for viewport/mouse. |
| Barrel | `index.ts` re-exports store / panels / shell. |
| Tests | `store.test.ts` — 13 reducer/selector cases (track, layer, hover, focus/camera, cars, heatmap preset, sections). |

**Commands run.**

- `npm test` — 38 passed (13 new)
- `npx tsc --noEmit` — clean
- `npm run pin` — matches baseline
- `npm run build` — green

**Autocomplete / freeze probe (vs U01 diagnostics).**

| Probe | Result |
|---|---|
| `dashboard-canvas` imports under `src/features/playground/` | **0** (grep) |
| `tsc --noEmit --incremental false -p tsconfig.measure.json` | ~7.5 s (U01 after: ~5.45 s; new playground/viewer files in program) |
| IDE/language-service feel on `playground/store.ts` | Cold open / completions stay on viewer + track graph — **no canvas value-import**. Residual canvas still in the measure program via old `src/components/dashboard/*` until U09. |
| U01 deferred checklist (“Editor autocomplete on `store.tsx`”) | Satisfied for the **new** playground store. Old `dashboard/store.tsx` still imports canvas; ignore it for playground work. |

**Deferred / notes.**

- Soft line budget: `store.ts` ~560, `panels.tsx` ~800 — measured overflows; legends + items UI kept in one panels file for U05 ownership. Split later if needed.
- Track dropdown lists ids for non-selected circuits (avoids eager `trackById` of all 25 on render). Selected shows full name.
- Route swap to `PlaygroundShell` is U09.
- Viewer still has no `StateProbe` export; playground hosts a local copy.

**Acceptance checklist.**

- [x] Owned files only; forbidden paths untouched
- [x] No import of `@/components/dashboard-canvas` from playground
- [x] Imports viewer + track contracts only
- [x] Pure reducer + tests for track / layer / hover / camera
- [x] No render-phase setState; no geometry math in store
- [x] Shell composes viewer + panels
- [x] `/dashboard` still works via old canvas
- [x] `npm test` / `tsc` / pin / build green
- [x] Autocomplete/timing note in Progress log
- [x] Progress log Batch 5 written

**Next batch.** U06 (lap comparison feature). U05-followups optional: trim panels line count; promote `StateProbe` into viewer if U06 wants it.

### Batch 6 — U06 Lap comparison feature (2026-10-16)

**Status.** Done. Build, `tsc`, pins, and `npm test` green. `/dashboard` still on `DashboardCanvas` (U09). Static map first — U07 playback skipped.

**What changed.**

| Area | Change |
|---|---|
| Store | `src/features/lap-comparison/store.ts` — thinner `State` / `Action` / `reducer` + selectors; `ComparisonProvider` with chrome zoom/locate on the view ref. Defaults match route (`car1Visible: false`). Car 2 path = `offsetPolyline` lateral offset (`CAR2_LATERAL_M`), not telemetry lap `b`. No geometry math in the reducer; no canvas/playground imports. |
| Chrome | `chrome.tsx` — back (router), theme toggle, zoom in/out + locate wired to provider; Settings / Log out labeled disabled (`unavailable` + title reason). |
| Scene | `comparison-scene.tsx` — Canvas + `ViewerScene` + optional racing lines + hover overlay. Comparison defaults: no debug controls, cars off unless toggled. |
| Shell | `shell.tsx` + `shell-entry.tsx` (`ssr: false` client dynamic). Chrome mounts inside the provider. |
| Route | `src/app/dashboard/lap-comparison/page.tsx` → feature entry. Deleted route-local `chrome.tsx` / `shell-client.tsx`. |
| Barrel | `index.ts` re-exports store / chrome / scene / shell. |
| Tests | `store.test.ts` — 12 cases (defaults, track, layer, hover, car focus, progress clamp, car2 offset ≠ race path, selectors). |

**Commands run.**

- `npm test` — 50 passed (12 new)
- `npx tsc --noEmit` — clean
- `npm run pin` — matches baseline
- `npm run build` — green (`/dashboard` + `/dashboard/lap-comparison`)

**Deferred / notes.**

- **Delta chart** — skipped. First ship is static map only; no A-vs-B telemetry chart. Car 2 remains a lateral raceline offset, not lap `b`.
- **U07 playback/scrubber** — skipped (static map + chrome is enough for U06 acceptance). Mount later by editing `shell.tsx` if product needs scrubbing.
- Soft line budget: `store.ts` ~480 — measured overflow OK for provider + chrome callbacks in one file.

**Acceptance checklist.**

- [x] Owned files only; forbidden paths untouched
- [x] No import of `@/components/dashboard-canvas` or `@/components/dashboard/*` from lap-comparison
- [x] No import of `@/features/playground`
- [x] Imports viewer + track contracts only
- [x] Comparison store + tests for critical transitions
- [x] Chrome stubs wired or explicitly disabled with reason
- [x] Scene composes U04 viewer with comparison defaults
- [x] Route page points at new feature; old route-local chrome/shell-client deleted
- [x] No Spa globals; car2 ≠ lap `b`
- [x] `/dashboard` still on old canvas (U09 not this batch)
- [x] `npm test` / `tsc` / pin / build green
- [x] Progress log Batch 6 written; Next batch stated

**Next batch.** U08 (legacy isolation). U07 remains optional if scrubbing is required later.

---

## 1. What the app does, and the direction you recommend

Trackview is a race analysis viewer in early build. It shows circuit geometry in an orthographic Three.js map and paints telemetry onto the road ribbon. The user picks a track, inspects layers (normal, sections, heatmap), and places car markers along a lap fraction. The intended product question is where time is won or lost between laps.

**Domain concepts (code today vs aspirational).**

| Concept | In code today | Evidence |
|---|---|---|
| Track | Yes. Closed ring of samples in meters, +x east, +y north | `src/track/frame.ts:8-23` |
| Raceline | Yes. Separate polyline per track | `src/track/catalog.ts:63-91` |
| Lap metrics | Yes. Speed, brake, throttle, pedals, battery, tyres as `Float64Array` | `src/track/lap-metrics.ts:36-49` |
| Sector / section zone | Yes. Lap-fraction bands with color | `src/track/section-maps.ts:11-19` |
| Telemetry lap pair | Yes for spa, monza, texas. Fields `a` (reference) and `b` (comparison) | `src/track/real-telemetry.ts:22-28` |
| Driver | Field on JSON only. Not in UI state | `src/track/real-telemetry.ts:16-17` |
| Session | **Not present.** No type, loader, or route state | Grep of `src/` finds no `Session` type |

Do not invent a Session model until a second product surface needs it. When it arrives, define it in the foundation contracts first.

**Data flow.**

1. CSV sources under `scripts/tumftm/` feed `scripts/build-tracks.mjs`, which emits per-circuit TypeScript modules under `src/track/<id>.ts` today.
2. `src/track/catalog.ts:7-31` eagerly imports all 25 circuits into `TRACKS` and `RACE_LINES`.
3. `src/track/lap-metrics.ts` builds channels from FastF1 JSON (`real-telemetry.ts`) or a curvature-limited physics model.
4. `src/track/section-maps.ts` builds zones. Some call `lapMetrics` again.
5. UI samples series and builds Three.js buffers via `src/track/ribbon.ts` and `src/components/dashboard-canvas.tsx`.

**What the user sees.**

- `/dashboard` is the playground. `src/app/dashboard/page.tsx:2` imports `DashboardCanvas` **directly** (not the modular shell). Full debug panels, track picker, cars, heatmap, sections, hover tip.
- `/dashboard/lap-comparison` is the real app start. `page.tsx:12` mounts `LapComparisonShell` with `controls={false}` and `car1Visible: false`. `chrome.tsx` adds back, avatar menu, and bottom-left zoom/locate controls that are still stubs (`chrome.tsx:156-181`). No A-vs-B chart, no driver picker, no playback on this route yet.

**Recommended direction.**

Keep the playground as a lab. Make lap-comparison self-contained against shared contracts. Move geometry and fixtures out of TypeScript logic files. Split the canvas monolith into thin viewer pieces. Prefer deletion and lazy load over new frameworks. Keep unused components, but isolate them so they do not tax the language service. Do not block future analyses. New data sources, metrics, and charts plug into contracts without touching the scene.

**Skills used and missing.**

- Used `how` (explorers on playground, lap-comparison, repo map).
- Used `why` (git log). Thin history. `b9f2b1b` says the canvas monolith was kept on purpose while landing a lint-clean lab and a spa characterization pin.
- Used `architect` with parallel runners (feature-sliced vs domain-first vs laziness). One runner dropped on model quota. Synthesis is below.
- Used `typescript-best-practices` as the typing bar.
- Used `unslop` for this document.
- `benchmark-checklist` was **not installed**. Measurements in section 7 are defined manually.
- `interrogate` ran after draft. Findings are folded into this file. Remaining open questions are in section 8.

---

## 2. Current architecture and the cause of the autocomplete freeze

### Architecture today

Layers are flat and tangled.

```text
app/dashboard/page.tsx ──► dashboard-canvas.tsx ──► catalog.ts ──► 25× track/*.ts
app/dashboard/lap-comparison/page.tsx
        ├─ chrome.tsx
        └─ shell-client.tsx ──► (dynamic) dashboard/shell
                                      └─ store / scene / panels / types
                                            └── each imports dashboard-canvas.tsx
```

Facts.

- Modular dashboard is a wrapper, not a replacement. `src/components/dashboard/index.ts:39-62` re-exports scene primitives from the monolith. `store.tsx:22-36`, `scene.tsx:10-24`, `panels.tsx:3`, `types.ts:5-13` import the same file.
- No hard TypeScript import cycle was found. `src/track/*` never imports components. The costly loop is logical. Editing store or scene re-resolves the canvas plus the full catalog.
- Duplicate viewers. `track-view-app.tsx:21-24` is marked deprecated and unrouted (`src/app/page.tsx` is absent on disk). It still pulls `spa` and the playback/telemetry dock graph.
- `src/lib/telemetry.ts:21-24` calls `trackTelemetry('spa')` at module load and throws if missing. Fake `SECTORS` there are unrelated to `section-maps.ts`.
- `smooth.ts:1` imports `three` for Catmull-Rom. Pure analysis depends on the 3D library.
- Zero `*.test.ts` files. The only pin is `scripts/pin-dashboard-contract.mts` plus `scripts/pin-dashboard-contract.baseline.json`.

### Autocomplete freeze. Cause with evidence

Symptom. Editor autocomplete freezes about 100 seconds on dashboard work.

**Primary cause.** Eager TypeScript geometry. `catalog.ts` statically imports 25 modules whose bodies are giant numeric array literals. Measured size of `src/track` is **1,471,493 bytes**. Geometry modules alone are about **1.27 MB / ~50k lines**. Any file that imports `catalog` or `dashboard-canvas` pulls that graph into the language service.

Supporting evidence.

| Evidence | Value | Source |
|---|---|---|
| Track folder size | 1,471,493 bytes | `Get-ChildItem src\track -Recurse` |
| Largest geometry | `spa.ts` 76,815 bytes, 2,804 lines | file size listing |
| Eager imports | `catalog.ts:7-31` | file read |
| Program file count | 1,292 files via `tsc --listFilesOnly` | includes `.next` types + node_modules `.d.ts` |
| `tsc --extendedDiagnostics` (incremental on) | Misleading. Types ~90. Total ~3.8s. No real check time | measured this session |
| `tsc --extendedDiagnostics --incremental false` | Files 1,292. TS lines ~58,968. Types ~238k. Instantiations ~154k. Memory ~560 MB. Total ~10.9s | freeze investigation |
| Trace `createSourceFile` | Track geometry modules ~221 ms combined. `dashboard-canvas.tsx` ~24 ms. `tabler-icons-react.d.ts` ~261 ms. `lucide-react.d.ts` ~93 ms | `tsc --generateTrace` this session |
| Check hot spot | `dashboard-canvas.tsx` ~926 ms. `select.tsx` ~346 ms. sample track module ~111 ms | `@typescript/analyze-trace` |
| `CatalogTrack` | Defined `catalog.ts:61`, **never referenced** elsewhere | grep |
| Circular imports | None | `madge --circular` on `src` |

**Secondary cause.** Monolith size. `dashboard-canvas.tsx` is 126,449 bytes and ~3,862 lines. Dashboard modules import it for types and primitives, so completions revisit a huge check graph.

**Tertiary cause.** Dual mega icon packages. `@tabler/icons-react` (chrome, top-bar, telemetry-dock) and `lucide-react` (select icons only, `select.tsx:4`) both ship enormous `.d.ts` files. They dominate one-shot parse time. They amplify freezes when the LS reloads the program, but they are not the main reason dashboard edits stall. Track literals plus the canvas are.

**Honesty on the 100s number.** Cold `tsc --incremental false` is about 11s here, not 100s. The reported autocomplete stall is IDE amplification (repeated checks, Next plugin, ESLint) on this fat graph. U01 attacks geometry parse cost. U05 attacks the canvas import on the playground store. Do not treat geometry JSON alone as proof that a 100s stall is gone until the U05 probe is timed.

**Not the cause.**

- A used 50,000-member literal union on coordinates. Exports widen to `Track`. `CatalogTrack` is unused. Parsing the arrays still hurts.
- Circular imports. None found (`madge` clean).
- Barrel alone. No imports of `@/components/dashboard` root were found. Subpath imports still load the canvas.
- Moving files under a `legacy/` folder without excluding them from `tsconfig`. The include is every `src` TS file, not the import graph.

**Confirming commands.**

```bash
npx tsc --noEmit --extendedDiagnostics --incremental false
npx tsc --noEmit --incremental false --generateTrace ./trace-out
npx @typescript/analyze-trace ./trace-out --forceMillis 100
npx tsc --noEmit --listFilesOnly | findstr /i ".next"
# editor: time autocomplete after U05 (not U01) on the playground store file
```

Always pass `--incremental false` when measuring. Incremental runs understate type count and check cost.

**Fix order.** U01 moves geometry to JSON, narrows `tsconfig`, and makes the catalog lazy without static per-track imports. U04/U05 stop importing the canvas for types (that edit is forbidden in U01). Drop or tree-shake one icon package in U08 if measurements still show pain.

---

## 3. Module audit table

Verdicts. keep, rebuild, merge, move, delete. Delete only for code with no purpose. Rebuild means goals and contracts first, without copying the old implementation.

| Path | Purpose | Smells | Verdict | Reason |
|---|---|---|---|---|
| `src/track/frame.ts` | Planar types, `toScene`, `boundsOf`, `samplePath` | Clear. WeakMap arc cache | Keep | Foundation. Add brands and TSDoc units in U01 |
| `src/track/catalog.ts` | Eager registry of 25 tracks | Eager imports. Unused `CatalogTrack`. Alias `mexico-city` | Rebuild | Lazy `trackById` / `raceLineFor` / `listTrackIds`. Load JSON on demand |
| `src/track/*.ts` (25 circuits) | Centerline + raceline ground truth | ~95% numeric literals in `.ts` | Move | Emit JSON from `build-tracks.mjs`. Delete `.ts` literals |
| `src/track/real-telemetry.ts` | FastF1 traces for 3 tracks | `as TrackTelemetry` casts L32-34. `b` unused by heatmaps | Rebuild | Owned by **U01** as `loadTelemetry`. Schema at boundary. `Result`. U06 may start using lap `b` |
| `src/track/data/*-telemetry.json` | Equal-distance series | Fine as data | Keep | Stay as JSON. Validate once |
| `src/track/lap-metrics.ts` | Physics + real metric channels | Long. Inline constants. Mixed sources. Exported unused helpers | Rebuild | Pure `buildLapMetrics`. Named constants with units. No module-level work |
| `src/track/section-maps.ts` | Sector and ERS zones | Fixtures inline. Calls `lapMetrics` | Rebuild → `sections.ts` | Fixtures to JSON. One pure `resolveSections` |
| `src/track/ribbon.ts` | Ribbon and stroke buffers | Heavy. Some unused exports (`edgeLoops`) | Keep | Focused geometry. Characterize before touch |
| `src/track/smooth.ts` | Resample with Catmull-Rom | Depends on `three` | Merge into analysis | Local spline. Drop `three` from analysis |
| `src/track/colormaps.ts` + `.json` | Palette LUTs | Data next to sampler | Move data, keep sampler | JSON under `data/`. ~30 line sampler |
| `src/track/heatmap-presets.ts` | Metric ↔ palette presets | Tiny | Keep | Config |
| `src/components/dashboard-canvas.tsx` | Scene + panels + playground state | God file. Long functions. Magic numbers. Exports library API | Rebuild | Split into viewer pieces from visual goals. Keep file pinned until U09 |
| `src/components/dashboard/store.tsx` | Provider state | Many `useState`. Geometry in store. Duplicated fit | Rebuild | One reducer. No geometry math |
| `src/components/dashboard/types.ts` | Dashboard contracts | Imports types from canvas. RefObject in derived | Rebuild | Move to domain/viewer contracts. No canvas import |
| `src/components/dashboard/scene.tsx` | Canvas wiring | Casts on derived refs | Rebuild | Thin wiring only |
| `src/components/dashboard/panels.tsx` | Pass-through to Debug/Items | No logic | Merge | Into playground controls |
| `src/components/dashboard/shell.tsx` | Provider + loader | Render-phase `setGone`. Magic timeout | Merge | One shell pattern with lap-comparison |
| `src/components/dashboard/index.ts` | Barrel | Re-exports canvas | Delete | Direct imports. No behavior loss |
| `src/app/dashboard/page.tsx` | Playground entry | Thin | Keep | Later point at playground shell |
| `src/app/dashboard/lap-comparison/page.tsx` | Real app entry | Hardcoded flags | Keep | Flags become route config |
| `src/app/dashboard/lap-comparison/chrome.tsx` | Floating chrome | Stub zoom/locate. Settings/logout no-ops | Rebuild | Goals-first chrome with real callbacks or removed stubs |
| `src/app/dashboard/lap-comparison/shell-client.tsx` | `dynamic(..., { ssr:false })` | Duplicate loader UI | Merge | One loader story |
| `src/components/track-view-app.tsx` | Deprecated spa viewer | Hardcoded spa. Broken export name vs old root import | Keep (isolate) | User keeps unused. Move under `legacy/` so LS graph stays clean |
| `src/components/track-canvas.tsx` | Older ortho viewer | Superseded | Keep (isolate) | Reference quality. Isolate |
| `src/components/playback-context.tsx` | Playback + keyboard | Triple context. Global keys | Rebuild when needed | One reducer. Do not wire until comparison needs it |
| `src/components/telemetry-dock.tsx` | Chart + scrubber chrome | Tied to spa globals | Keep (isolate) | Reuse later behind contracts |
| `src/components/telemetry-chart.tsx` | ECharts lap chart | Heavy dep for one chart | Keep | Wrap behind chart contract |
| `src/components/timeline-scrubber.tsx` | Scrubber UI | Complex | Keep (isolate) | Rebuild from goals when playback lands |
| `src/components/top-bar.tsx` / `toolbar.tsx` / `icon-button.tsx` / `map-focus.tsx` | Old chrome | Unused by new routes | Keep (isolate) | Quality varies. Isolate |
| `src/lib/telemetry.ts` | Spa playback series | Module throw. Spa-only. Fake sectors | Rebuild or delete after migration | Works for old dock. Not useful for multi-track app |
| `src/lib/utils.ts` / `hover-tip-animation.ts` / `quiet-three-clock-warning.ts` | Helpers | Quiet-three is a console patch | Keep | Document why for quiet-three |
| `src/components/ui/*` | shadcn/base-ui | Dual icons via lucide in select | Keep | Prefer one icon set in a later unit if measured |
| `scripts/build-tracks.mjs` | CSV → TS modules | Emits `.ts` literals | Rebuild emit target | Emit JSON. Keep CSV parse |
| `scripts/pin-dashboard-contract.mts` | Characterization pin | Good | Keep | Expand coverage in U01 |
| `scripts/fetch-f1-telemetry.py` | Telemetry generator | Not fully read this session | Keep | Assume continues to write JSON |

**Works but not useful for the growing app.** Spa-only globals in `lib/telemetry.ts`. Heatmaps reading only `pack.a` while `b` sits unused (`lap-metrics.ts:136-138`). Car 2 on the map is a lateral offset of the raceline (`store.tsx:45`, `CAR2_LATERAL_M`), not telemetry lap `b`. Playground `metricsSource` frozen to `'auto'` in `dashboard-canvas.tsx:3265`. Stub chrome buttons. Unused `CatalogTrack`. Unused `edgeLoops` export. Dual state trees (`DashboardCanvas` vs `store.tsx`) still ship in parallel.

---

## 4. Target architecture

### Layers (one way)

| Layer | Owns | May import | Must not import |
|---|---|---|---|
| data | JSON geometry, telemetry, fixtures, palettes | nothing internal | anything |
| domain | Branded IDs, units, `Track`, schemas, `Result` | data schemas only | analysis, state, ui |
| analysis | Pure lap math, sections, resample, palette sample, ribbon buffers | domain, data | react, three, next |
| state | Reducers and selectors | domain, analysis | ui, next/router |
| ui | R3F scene pieces, DOM chrome, routes | state, analysis, domain, data | (other features' internals) |

Justification. Data changes when tracks or telemetry update. Domain words must stay stable for every future analysis. Analysis must be testable without a browser. State churns with UI. Rendering changes for visual reasons and must not re-derive physics.

### Import rule (enforceable)

Add `dependency-cruiser` (or `eslint-plugin-boundaries`) in U01.

```text
data → (none)
domain → data
analysis → domain, data
state → domain, analysis
ui → state, analysis, domain, data
app → ui/features only
```

Forbidden. `analysis` importing `three` or `react`. `domain` importing UI. Barrel re-exports across layers. Feature A importing Feature B internals.

### Organize by feature

- `src/features/viewer/` holds scene pieces rebuilt from goals (road, racing line, heatmap, sections, car, hover, camera).
- `src/features/playground/` holds playground store and debug panels.
- `src/features/lap-comparison/` holds comparison store, chrome, and later delta chart.
- `src/track/` holds data, domain, analysis (shared by all features).
- `src/components/legacy/` holds kept unused viewers so they leave the hot graph.
- `src/components/ui/` stays shared primitives.

**Promotion rule.** Playground may import `viewer` and `track`. Shared code never imports playground. A lab experiment graduates by gaining a contract, tests, and a home under the feature that needs it. Copy through the contract. Do not keep a permanent import from playground into the app.

### How to add extensions

- **New data source.** Drop JSON under `src/track/data/<source>/`. Add a schema in domain. Add one loader returning `Result`. Register in catalog. No scene edits.
- **New metric.** Extend `MetricId` union. Add one pure computer in analysis. Add range and format. Add optional palette preset. UI discovers via registry.
- **New chart.** Add a component under the feature that consumes series selectors. Chart library stays behind one adapter module.

### Conventions

- File soft limit 250 lines. Review trigger at 400.
- Functions roughly 5 to 20 lines. Split for clarity, not for length.
- Booleans read as questions. Functions are verb plus noun. Collections are plural.
- Every export gets short TSDoc with units (m, m/s, ms, lap fraction 0–1).
- Comments explain only non-obvious why. Delete what-comments.
- Errors. `Result<T, DomainError>` at data boundaries. Typed throws inside UI for programmer mistakes. Never null as a signal. Never error codes. Never `any`. No unchecked casts after parse.
- Tests colocated as `*.test.ts`. Characterization before rebuilds. Test public contracts and visible output.
- Abstractions only on second concrete use. No single-impl interfaces.

### Final folder tree

```text
src/
  app/
    dashboard/
      page.tsx
      lap-comparison/
        page.tsx
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
    playground/
      store.ts
      panels.tsx
      shell.tsx
    lap-comparison/
      store.ts
      chrome.tsx
      shell.tsx
      delta-chart.tsx          # when product needs it
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
    heatmap-presets.ts
  lib/
    result.ts
  components/
    ui/
    legacy/                   # isolated unused keepers
  app/globals.css
  app/layout.tsx
```

Dependency diagram.

```text
app → features → state(in feature) → analysis → domain → data
                 ↘ viewer (ui) ↗
legacy ⟂ (no imports into features)
```

### Architect synthesis

Three shapes were explored.

1. **Feature-sliced** (`features/*` + `shared/data` hooks). Strong promotion story. Risk of inventing `shared/` too early.
2. **Domain-first minimal folders.** Strong typing and purity. Risk of under-isolating the real app from the playground.
3. **Laziness extreme.** JSON move + split canvas in place under existing names. Fastest freeze fix. Risk of leaving ownership muddy.

**Chosen base.** Domain-first layers with feature folders only where ownership is real (`viewer`, `playground`, `lap-comparison`). No `shared/` mega-tree. Graft lazy JSON catalog and icon cleanup from the freeze evidence. Graft promotion rule from the feature-sliced runner.

---

## 5. Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Fix only `tsconfig`, keep `.ts` geometry | Literals stay in the program. Freeze remains. Data stays in logic files |
| Deep barrels per layer | Current `index.ts` already shows the cost. Direct imports win |
| Full state library (Redux/Zustand) now | Two reducers cover need. No second concrete use |
| Eager load all tracks + virtualize draw | No measurement. Lazy load by ID is smaller |
| Rewrite canvas in place without pins | 3,862 lines without tests. Characterization first |
| Introduce Session / driver model in U01 | No product surface yet. Speculative generality |
| Split canvas only under `components/dashboard` with zero `features/` | Viable laziness path. Rejected as the long-term owner for lap-comparison because playground and app would keep sharing one folder. `features/` earns its place once two consumers of `viewer` exist (playground + lap-comparison) |
| Add Zod without multiple schemas | Hand parsers for one shape are enough. If U01 introduces ≥2 JSON schemas, Zod earns its place as one dep |
| Workers / typed-array rewrite now | Defer until analysis benchmark exceeds budget in section 7 |

---

## 6. Work units and the dependency table

Rules. No two units own the same file. Shared contracts live in U01. Each unit is one session (~15 files max). Each leaves build + types + tests green alone in dependency order. Foundation includes safety net and freeze fix. Last unit removes old paths.

### U01. Foundation contracts, safety net, editor fix

**Goal.** Move geometry out of TypeScript literals, keep every existing caller compiling, and cut language-service parse cost.

**Depends on.** None.

**Owned paths.** `tsconfig.json`, `package.json` (test runner + `npm test` only), vitest config, `eslint.config.mjs`, optional `.dependency-cruiser.cjs` (fixture-only, see tasks), `src/track/domain.ts`, `src/lib/result.ts`, `src/track/catalog.ts`, `src/track/frame.ts` (TSDoc units only, no nominal brands on `x`/`y`), `src/track/real-telemetry.ts`, `src/track/data/geometry/*.json`, existing `src/track/data/*-telemetry.json` (paths stay unless `real-telemetry.ts` is updated in the same unit), deletion of `src/track/<circuit>.ts` literal modules, thin `src/track/spa.ts` re-export while `track-view-app.tsx` still imports it, `scripts/build-tracks.mjs`, `scripts/pin-dashboard-contract.mts`, `scripts/pin-dashboard-contract.baseline.json`, `scripts/measure-tsc.mjs`.

**Forbidden paths.** `src/components/**/*`, `src/app/**/*`, `src/track/lap-metrics.ts`, `src/track/section-maps.ts`, `src/track/ribbon.ts`, `src/track/colormaps.ts`, `src/track/colormaps.json`, `src/track/heatmap-presets.ts`, `src/track/smooth.ts`.

**Contracts consumed.** None.

**Contracts produced.** `TrackFile` (JSON shape with **wide** `number[][]` or tuple-of-number annotations, never inferred literal unions), `parseTrack`, `Track`, `TrackSample`, `Xy` (still plain `number` fields), `Result`, `listTrackIds`, `trackById`. **Compat exports that must remain.** `TRACKS`, `RACE_LINES`, `raceLineFor`, `trackTelemetry`, `sampleTrace`. Callers in canvas, store, and the pin keep their import names. New names may exist beside them. Do not rename `lapMetrics` or `resolveSectionMap` in this unit.

**Tasks.**

1. Narrow `tsconfig.json` include to `src/**/*.ts(x)`, `next-env.d.ts`. Exclude `node_modules`, `.next`, and (once U08 exists) `src/components/legacy/**`.
2. Install Vitest (or chosen runner). Add `npm test`. Own those `package.json` lines.
3. Change `build-tracks.mjs` to emit `src/track/data/geometry/<id>.json` and regenerate `catalog.ts` import list from `TRACK_JOBS`.
4. Replace 25 literal modules with JSON. **JSON typing rule.** Every geometry import is annotated as `TrackFile` (or `number[][]`) before `parseTrack`. Do not let TypeScript infer thousands of literal tuples from JSON. That recreates the freeze.
5. **Caller-compat rule.** Keep exporting `TRACKS` and `RACE_LINES` so `dashboard-canvas.tsx` and `store.tsx` compile without edits. Prefer sync catalog built by mapping parsed JSON (wide-typed) over a rename to `trackById` only. Lazy `trackById` may exist as an addition. Removing `TRACKS` fails this unit.
6. Keep thin `spa.ts` re-export of parsed spa geometry for `track-view-app.tsx`.
7. Write `domain.ts` with shared types and TSDoc units. **No nominal brands on meter fields** in U01. Brands on IDs may wait. Plain `number` keeps ribbon, canvas, and Three.js compiling.
8. Write `result.ts`. Rebuild `real-telemetry.ts` with boundary parse. Keep file paths or update imports inside this owned file only. Keep `trackTelemetry` / `sampleTrace` names.
9. Do **not** move `colormaps.json` or extract section fixtures here. Those stay for U02/U03 so U01 does not edit their owner files.
10. Dependency-cruiser is optional. If added, ship a **fixture that proves one rule**, and allow `smooth.ts` → `three` until U02. Do not fail the whole repo on that edge in U01.
11. Keep the existing pin digests (zones, sides, offset). Prefer spa-first load inside the pin. Do not require full-catalog eager load for the default pin run.
12. Add `measure-tsc.mjs` with `--incremental false`.

**Tests before change.** Pin baseline matches. After change, update baseline only when intentional. `npm test` runs the pin (or a thin wrapper around it).

**Acceptance.** Build, `tsc`, pins, and `npm test` pass without editing `src/components/**`. No geometry `.ts` literal bodies remain. Geometry JSON is wide-typed through `parseTrack`. `TRACKS` / `RACE_LINES` / `trackTelemetry` still resolve. `tsc --listFilesOnly` shows no `.next`. Measure and record diagnostics before/after. **Do not** claim the 100s `store.tsx` autocomplete is gone. Canvas still dominates that file until U05. U01 must show a clear drop in geometry parse/check cost.

**Rollback.** Revert U01. Restore geometry `.ts` from git.

### U02. Pure analysis rebuild

**Goal.** Rebuild lap math and sections as pure functions without breaking frozen callers.

**Depends on.** U01.

**Owned paths.** `src/track/lap-metrics.ts`, `src/track/sections.ts` (new), `src/track/section-maps.ts` (delete after re-export shim or full replace), `src/track/smooth.ts`, `src/track/data/section-fixtures.json` (created here), `src/track/lap-metrics.test.ts`, `src/track/sections.test.ts`, analysis fixtures under `src/track/__fixtures__/`.

**Forbidden paths.** `src/track/domain.ts`, `src/track/catalog.ts`, `src/track/data/geometry/*`, `src/track/ribbon.ts`, `src/track/colormaps.ts`, `src/components/**/*`, `src/app/**/*`, `scripts/pin-dashboard-contract.*`.

**Contracts consumed.** U01 types and telemetry loaders.

**Contracts produced.** Pure builders. **Compat aliases required.** `export function lapMetrics ...` and `export function resolveSectionMap ...` remain (or re-export) so canvas, store, and the pin keep compiling. Internal names like `buildLapMetrics` are fine beside them. Update `heatmap-presets.ts` only if `MetricId` import path changes. If so, add that one import-line file to this unit’s owned paths for the redirect only.

**Tasks.**

1. Characterization tests from current spa/monza outputs (unit owns these test files, not U01).
2. Rebuild physics and real-trace path. Named constants with units.
3. Extract section fixtures to JSON here. Replace `section-maps.ts` with `sections.ts` plus compat export.
4. Remove `three` from resample.
5. Deduplicate pedal and battery helpers.

**Acceptance.** Pins still pass (same export names). New unit tests pass. No `three` in analysis. No `any`.

**Rollback.** Revert U02.

### U03. Geometry and palette sampler

**Goal.** Keep ribbon correct and palette sampling thin.

**Depends on.** U01. Parallel with U02 if only U01 contracts and unchanged `MetricId` import path are used. If U02 moves `MetricId`, wait for U02 or take the one-line import redirect in U02.

**Owned paths.** `src/track/ribbon.ts`, `src/track/colormaps.ts`, `src/track/colormaps.json` (move to `data/palettes.json` here if desired), `src/track/heatmap-presets.ts` (unless U02 took the MetricId redirect), adjacent tests.

**Forbidden paths.** `src/track/lap-metrics.ts`, `src/track/sections.ts`, `src/track/section-maps.ts`, `src/track/domain.ts`, `src/components/**/*`.

**Contracts produced.** Stable ribbon and palette signatures. Keep existing export names the pin and canvas already call.

**Tasks.**

1. Characterization tests on spa/monza ribbon outputs.
2. Remove dead exports. Bound or document caches.
3. Optionally move palette tables to JSON with wide typing. Sampler stays small.

**Acceptance.** Pins match within tolerance. No `any`.

**Rollback.** Revert U03.

### U04. Viewer scene split

**Goal.** Split the monolith along its existing export surface so behavior stays pinned.

**Depends on.** U01, U02, U03.

**Owned paths.** `src/features/viewer/*.tsx` (new), adjacent tests. May **read** `dashboard-canvas.tsx` for extract. Must not edit canvas until U09.

**Forbidden paths.** `src/components/dashboard-canvas.tsx` (no writes), `src/components/dashboard/*`, `src/app/**/*`, `src/track/**/*` (import contracts only).

**Contracts produced.** Viewer props matching today’s exports at `dashboard-canvas.tsx:3824-3850` (`Road`, `Camera`, `ItemCar`, …).

**Tasks.**

1. Prefer **extract / move** along that export block over a from-scratch rebuild. Laziness Protocol. Characterization first.
2. Contract tests for props in and buffers or digests out (bounds, one heatmap sample, one car pose).
3. Soft file-size budget ~250–400 lines. Do not invent a file per three-line helper. A measured overflow may add one more file (for example `rig.tsx` for Grid/Camera).

**Acceptance.** Build passes. Digests match pin tolerances for the extracted pieces. No physics inside viewer files. Canvas remains the playground/runtime pin until U09.

**Rollback.** Delete `src/features/viewer/*`.

### U05. Playground state rebuild

**Goal.** Explicit playground reducer feeding the viewer.

**Depends on.** U01, U02, U04.

**Owned paths.** `src/features/playground/store.ts`, `panels.tsx`, `shell.tsx`, adjacent tests.

**Forbidden paths.** `src/components/dashboard-canvas.tsx`, `src/components/dashboard/*`, `src/features/lap-comparison/*`. May **import** `src/track/**` contracts. Must not edit track files.

**Contracts produced.** Playground `State`, `Action`, reducer, selectors.

**Tasks.**

1. Test-first transitions for track, layer, hover, camera.
2. Rebuild panels from display goals.
3. Shell composes viewer + panels. Stop value-importing `dashboard-canvas.tsx` for types.

**Acceptance.** No render-phase setState. No geometry math in store. Tests pass. Manual autocomplete probe on the new store file. Record timing next to U01 diagnostics. This is where residual canvas-import freeze should die.

**Rollback.** Revert U05. Old canvas route still works.

### U06. Lap comparison feature

**Goal.** Real app slice against contracts.

**Depends on.** U01, U02, U03, U04.

**Owned paths.** `src/features/lap-comparison/store.ts`, `chrome.tsx`, `comparison-scene.tsx`, `delta-chart.tsx` (only if product needs it), `src/app/dashboard/lap-comparison/page.tsx`, delete of route-local `chrome.tsx` / `shell-client.tsx` after move, adjacent tests. **Does not own** `shell.tsx` if U07 will mount playback there. If U07 is skipped, U06 owns `shell.tsx` too.

**Forbidden paths.** `src/components/dashboard-canvas.tsx`, `src/components/dashboard/*`, `src/features/playground/*`, `src/app/dashboard/page.tsx`. May import `src/track/**` contracts. Must not edit track files.

**Contracts produced.** Comparison state. Chrome callbacks. Optional delta selectors.

**Tasks.**

1. Rebuild chrome from goals. Wire or remove stubs.
2. Compose viewer with comparison defaults.
3. Add delta chart only when comparing telemetry `a` and `b`. Car 2 offset is not lap `b`.

**Acceptance.** Route builds. No Spa globals. No dead no-op buttons unless labeled disabled with reason.

**Rollback.** Revert U06.

### U07. Playback (optional product gate)

**Goal.** Playback reducer when scrubbing is required.

**Depends on.** U01, U06.

**Owned paths.** `src/features/lap-comparison/playback.ts`, scrubber under the feature, `src/features/lap-comparison/shell.tsx` (mount playback), tests.

**Forbidden paths.** Legacy `playback-context.tsx` (U08), track sources (import only).

**Skip if.** First ship is static map only.

**Acceptance.** Play/pause/seek tests pass. Shell mounts scrubber. Lap fraction stays in sync.

**Rollback.** Revert U07.

### U08. Legacy isolation and dead deletion

**Goal.** Remove keepers from the TypeScript program, or delete what has no purpose.

**Depends on.** U04, U05, U06.

**Owned paths.** `tsconfig.json` exclude for legacy (or deletion), moves/deletes of `track-view-app.tsx`, `track-canvas.tsx`, `playback-context.tsx`, `telemetry-dock.tsx`, `timeline-scrubber.tsx`, `top-bar.tsx`, `toolbar.tsx`, `map-focus.tsx`, `icon-button.tsx`, delete `src/components/dashboard/index.ts`, delete or replace `src/lib/telemetry.ts` after call sites gone, optional icon consolidation, delete thin `spa.ts` re-export if nothing imports it.

**Forbidden paths.** `src/features/**/*`, `src/track/domain.ts`, `src/track/catalog.ts`, `src/track/data/geometry/*`.

**Acceptance.** Moving under `src/components/legacy/` is **not** enough. Either exclude that folder from `tsconfig` include, or delete the files. Grep shows no feature/app imports. Language service no longer loads those modules in the main program.

**Rollback.** Revert moves/excludes/deletes.

### U09. Integration and old path removal

**Goal.** Point the playground route at the new shell. Delete the monolith and old dashboard wrappers.

**Depends on.** U04, U05, U06, U08. U07 if playback shipped.

**Owned paths.** `src/app/dashboard/page.tsx`, `src/components/dashboard-canvas.tsx` (delete), `src/components/dashboard/*` (delete), final pin run. Does **not** reclaim `package.json` test scripts from U01. Does **not** rewrite lap-comparison `page.tsx` if U06 already owns it.

**Forbidden paths.** New feature logic. Track analysis bodies.

**Tasks.**

1. Point `/dashboard` at playground shell.
2. Delete canvas and old dashboard modules.
3. Run full pins, `tsc`, `lint`, `build`, `npm test`.
4. Confirm import boundaries (cruiser or eslint) if enabled.

**Acceptance.** Both routes work. Monolith gone. No `any` in touched paths. Freeze still improved vs baseline.

**Rollback.** Revert U09. Reintroduce canvas from git only as emergency.

### Dependency table (for later batching)

| Unit | Depends on | Can run in parallel with |
|---|---|---|
| U01 | — | — (first) |
| U02 | U01 | U03 |
| U03 | U01 | U02 |
| U04 | U01, U02, U03 | Nothing that edits viewer or depends on finished viewer props |
| U05 | U01, U02, U04 | U06 only after U04 has landed and viewer contracts are stable |
| U06 | U01, U02, U03, U04 | U05 only after U04 has landed. Paths are disjoint but both need finished viewer |
| U07 | U01, U06 | U08 on disjoint paths |
| U08 | U04, U05, U06 | U07 |
| U09 | U04–U08 | — (last) |

Parallel units must code against U01 contracts, not each other's unreleased files. Contract changes go through U01 first.

---

## 7. Measurements to take (only those that guard a decision)

| Measurement | When | Guards |
|---|---|---|
| `tsc --extendedDiagnostics --incremental false` (files, types, parse, check, memory, total) | Before/after U01, after U09 | Freeze fix |
| `tsc --generateTrace` + `analyze-trace` hot spots | Before/after U01 | Confirms geometry and canvas drop |
| `tsc --listFilesOnly` filtered for `.next` | After U01 | Include scope |
| Manual autocomplete timing on playground store | After U05 (not U01) | Residual canvas-import freeze |
| `npx tsx scripts/pin-dashboard-contract.mts` vs baseline | Every unit | Behavior drift |
| `buildLapMetrics` over 25 tracks (ms) | After U02 | Whether memo/workers earn a place. Defer unless one track > 200 ms on a laptop |
| `next build` route sizes for both dashboards | After U06, U09 | Whether more code-splitting is needed |
| Scrubber jank check | After U07 if built | Keep or cut animation |

Deferred by default. Extra typed arrays, workers, virtualization, broader memoization. Each needs a number above before it ships.

---

## 8. Risks, open questions, and assumptions

### Risks

- Canvas behavior is under-tested. Pins reduce risk. Keep the file until U09.
- Physics constants in `lap-metrics.ts` (`V_MAX = 94.5`, brake 32, etc.) have no cited source. Preserve via pins. Do not retune during refactor.
- Only 3 of 25 tracks have real telemetry. Fallback must stay explicit.
- TUMFTM data is LGPL-3.0. Keep attribution in JSON and `build-tracks.mjs`.
- Removing `three` from resample can drift geometry. Pin resample outputs first.
- Dual icon packages inflate LS parse. Secondary. Fix after geometry move if freeze remains.

### Open questions

- First lap-comparison ship. Static map only, or A-vs-B delta + playback. U07 stays optional until answered.
- Keep ECharts or wrap a lighter chart. Defer until a second chart appears (principle 9).
- Should legacy keepers be deleted, excluded from `tsconfig`, or moved out of `src`. A move alone does not shrink the language-service program.
- One icon library. Prefer Tabler (already in chrome) and drop lucide from select when convenient.

### Assumptions

- I read route files, dashboard modules, catalog, frame, lap-metrics head and structure, ribbon head, real-telemetry, shell/store/scene/panels/types, chrome, shell-client, scripts headers, and measured sizes. I did not line-read all 25 geometry files. Their shape matches `spa.ts` and `build-tracks.mjs`.
- `fetch-f1-telemetry.py` was not fully read. JSON shape comes from `real-telemetry.ts` and the three JSON files.
- Git history is short. Intent of the monolith is explicit in `b9f2b1b` commit message. Broader product intent is inferred from comments and structure.
- No unit test runner is configured today. U01 adds pins and a test script. Later units assume Vitest or the repo's chosen runner.

### Interrogate notes (folded)

Cross-checks that changed this plan.

1. **Ownership bug fixed.** Prior draft let U02 and U03 both own `colormaps.ts`. Now U01 owns data move. U03 owns sampler only.
2. **`catalog.ts` ownership fixed.** Prior draft rewrote catalog in U01 tasks without listing it under owned paths. It is owned by U01 now.
3. **Route fact fixed.** `/dashboard` imports `DashboardCanvas` directly, not via shell.
4. **Freeze mechanism corrected.** Primary is eager geometry parse plus canvas check cost. Unused `CatalogTrack` is not the smoking gun. Icon `.d.ts` files are tertiary.
5. **Session language softened.** Session is aspirational, not present.
6. **Zod deferred** unless U01 lands multiple schemas.
7. **U07 marked optional** so the plan does not force playback before product need.
8. **Over-engineering pushback.** Rejected `shared/` mega-tree and early state libraries. Feature folders exist only for real ownership.
9. **U01 build break fixed.** Prefer delete literal modules. Optional thin `spa.ts` re-export only for legacy. Literal bodies must not remain.
10. **U01 size risk noted.** Large session. Prefer two commits inside one unit rather than splitting ownership.
11. **U01 acceptance narrowed.** Editor freeze on `store.tsx` moves to U05. U01 proves freeze reduction via `tsc` metrics and lazy-catalog invariant.
12. **`real-telemetry.ts` now owned by U01.**
13. **Test runner lands in U01.** Later units have an executable `npm test`.
14. **Lazy catalog invariant made explicit.** Static import of all geometry fails U01.
15. **Dependency table corrected.** U05/U06 do not run beside unfinished U04.
16. **U04 gains digest parity** before U05 depends on viewer.
17. **Grok interrogate ([2d1425b2](2d1425b2-05ce-4418-8926-ca70ba9235c3)).** U01 must keep `TRACKS` / `RACE_LINES` / `trackTelemetry` so forbidden callers still typecheck. JSON must be wide-typed through `parseTrack` or the literal-union freeze returns. Do not move palettes or section fixtures in U01. No nominal brands on meter fields in U01. U02 keeps `lapMetrics` / `resolveSectionMap` aliases. U04 extracts along the export block instead of a blind rebuild. U05 may import track contracts. U06/U07 split `shell.tsx` ownership. U08 must exclude or delete legacy from `tsconfig`. Softened the 100s claim vs ~11s cold `tsc`.

---

*End of plan. Group these units into batches later without rereading the tree. Use the dependency table.*
