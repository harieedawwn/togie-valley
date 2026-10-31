# Togie Valley - perf report (stage 34, from reading the code; nothing measured on a device yet)

Measure first: open `?perf=1`, play 60 s on the phone, press "Sao chép", paste the line. Red rows exceed the 16.7 ms budget (input 1, simulation 4, render 5, UI 2, margin 4).

## Ranked likely bottlenecks
1. **Draw calls from ink outlines (stage 35 - merge/instance).** `Render.addOutline` is called from 41 sites (render.js:373); every outlined mesh is drawn twice (fill + back-face hull), and Decor/chunks add `fill` + `outline` instanced pairs per chunk (decor.js:110-115, farm_fx.js:79-84). perf.js already trims outlines when calls > 150 (guardCalls), which is itself evidence the budget is hit. Fix: one outline pass per merged chunk, drop outlines on far/small props, measure calls in the overlay.
2. **Simulation systems all running every frame (stage 36 - throttle/skip).** 52 `Loop.onFrame` + 5 `Loop.onUpdate` callbacks run per rAF (core.js tick), including ambient, birds, critters, weather, farm_fx, fish_stall, furn_live, net. Only `P.throttled` users honour the tier rate. The overlay's "Nặng nhất" row names the costliest callbacks; fix the top ones first (skip when off-screen / indoors / invisible, lower rate at 30 Hz).
3. **Transparent fill and full-screen layers (stage 36).** 25 transparent materials in 15 modules (weather, rain_fx, ambient_plus, detail_extra mist, furn_live pool, placement ghosts) are alpha-blended over a full-resolution canvas; sorting stays on because renderOrder ranks the overlays (sortObjects=false would also ignore renderOrder in r128). Plus the sky quad and CSS grain/vignette layers (8 filter/backdrop rules in css/). Fill rate, not CPU, is the likely limiter at DPR 1.5 on low GPUs. Fix: per-tier resolution already exists; add cheaper rain/mist and check overdraw.
4. **DOM/UI work (stage 37).** HUD is event-driven, but clock/energy/money used to rewrite innerHTML on every event (fixed here: write only on change). Remaining: minimap redraw, hotbar `updHotbar`, panel layers over a live canvas. The overlay's UI row shows the cost.
5. **Per-frame allocations (done here).** perf_scan found 40 sites; the unconditional ones (audio frame context object, furn_live lamp glow arrays/closures, cast keyframe arrays) now use scratch objects. Remaining are event-triggered (net sends, emit payloads) and acceptable.
6. **Scene-graph traversal (stage 35).** three r128 recomputes matrixWorld for every child of a moved/auto-updating parent each frame (scene root forces it), so `matrixAutoUpdate=false` only saves the local compose; the real gain needs fewer objects (merging).

## Changed in stage 34
Profiler (Game.Prof in core.js, overlay in perf_ui.js), phone antialias off, one-frame hold under phone bottom-sheet panels, HUD write-on-change, static scenery matrices frozen, scratch objects in 3 hot paths. Already present and verified by reading: no shadow maps (blob shadows), powerPreference high-performance, DPR cap 1.5 on phones in Auto and 1 on the lowest tier, correct bounding spheres on chunks (chunks.js:40), hidden-tab pause (core.js:404).

## Changed in stage 40 (shading, water, sky)
No new draw calls, passes or textures. Toon fragment shader: ramp softness 0.02 -> 0.055, +1 smoothstep (4th highlight step), +1 shade-tint mix, +1 mood multiply (about +12 ALU on tier 0-1); rim = 1 normalize + 3 muls, only where material uRim > 0 (characters, props, foliage) and skipped by a uniform branch on tier 3. Tier table (quality.js `steps`/`rim`): Cao 4 steps rim 1, Vua 4 / 0.8, Thap 3 / 0.5, Sieu nhe 2 steps, no rim (shader cost below stage 39). Water: glint adds 1 normalize + 1 smoothstep (tiers 0-1 only); foam off on tier 3. Sky quad (already drawn on tiers 0-2): +1 length + 2 smoothstep for the sun glow. Ground AO is baked into vertex colours (zero runtime cost). Halftone dots are unchanged (terrain/buildings only; characters stay dot-free).

## Round 5 baseline
Measured 2026-10-31 with `node tools/shot.js farm town river --both --perf` (EdgeCore 156 headless, ANGLE/D3D11 on the dev PC GPU, `?shot=1` 10:00 sun). Warm-up 5 s, sample 10 s. Phone = 390x844 DPR 3 touch with CPU throttling 4x (CDP); the GPU is still the desktop one, so phone numbers show CPU cost only, not real phone fill rate. Frame times are capped by vsync (16.7 ms). Raw data: shots/perf-<label>.json.

| label | p50 ms | p95 ms | max ms | frames >50 ms | fps | draw calls | triangles | top cost (ms/call, Game.Prof) |
|---|---|---|---|---|---|---|---|---|
| farm-desktop | 16.7 | 16.8 | 17.3 | 0 | 60 | 110 | 1 468 165 | render 1.69, landmarks#41 0.04 |
| town-desktop | 16.7 | 16.7 | 17.3 | 0 | 60 | 157 | 1 561 029 | render 2.18, render#34 0.04 |
| river-desktop | 16.6 | 16.8 | 17.6 | 0 | 60 | 103 | 1 415 153 | render 2.17, landmarks#41 0.04 |
| farm-phone (CPU 4x) | 16.7 | 16.7 | 17.3 | 0 | 60 | 89 | 1 395 642 | render 8.08, landmarks#41 0.17 |
| town-phone (CPU 4x) | 16.7 | 33.2 | 50.0 | 0 | 57 | 108 | 1 479 497 | render 6.07, landmarks#41 0.14 |
| river-phone (CPU 4x) | 16.7 | 16.8 | 33.0 | 0 | 60 | 92 | 1 374 481 | render 5.32, landmarks#41 0.14 |

Reading: the CPU side of `render` (scene traversal + WebGL calls) is 5-8 ms under 4x throttle, about half the phone frame budget; simulation callbacks are each < 0.2 ms. Triangle counts of 1.4-1.6 M per frame are high for phones (likely grass/flowers/foliage instancing) and town exceeds the 150 draw-call guard on desktop. These are the S2 targets.
