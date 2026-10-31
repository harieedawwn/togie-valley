# Togie Valley - worker notes
Cozy 3D farming/fishing game, Vietnamese countryside, all game text in Vietnamese with full diacritics.
Stack: plain ES5 IIFEs on window.Game, Three.js r128 (vendor/three.min.js), no build step. Keep r128.
Machine: Windows, PowerShell. No git, ever. Safety net: copy the folder to ..\togie-valley-backup-r5-sN before big edits.
 
## Run and verify
- Serve: `node tools/serve.js` -> http://localhost:8080 (LAN URL printed for phones). Dev: ?dev=1 (Game.Dev). Perf overlay: ?perf=1.
- Screenshots: `node tools/shot.js <preset...> --both [--perf] [--frames n --every ms]` -> shots/. Open the PNGs with Read and judge them yourself. Add presets in the table in tools/shot.js.
- `node tools/check.js` must stay 0 errors / 0 warnings.
- Test lightly: check.js + the 1-2 existing tools/*_check.js or *_sim.js that cover what you changed + screenshots. Write a new test tool only when the prompt asks.
 
## Rules
- New js/css files: add to index.html AND the sw.js precache list (check.js verifies).
- Old saves must load: never rename item/crop/fish ids or save fields; new fields get defaults.
- CONTRACT.md is huge: grep it, never read it whole; update the section of any API you change.
- Keep the toon look (render.js ramp, ink outlines). Static props go through merged or instanced paths (decor.js chunks, detail_kit.js), never one mesh per prop.
- Per-frame code: no allocations; respect SimTier / throttle; skip work when off-screen or indoors.
- Character locomotion (walk/run) is final: do not change it.
- Only the final stage bumps the version (tools/bump_version.js).
- STATE.md: append at most 5 lines per stage under "## Round 5". Tick your stage in ROUND5.md.
 
## Budgets
(filled in by stage 2)
 
## When compacting
Keep: list of modified files, ROUND5.md status, last check.js and perf results.
