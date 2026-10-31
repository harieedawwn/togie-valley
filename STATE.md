# STATE - Togie Valley (final integration, patch 9)
Stack: plain ES5 IIFEs on window.Game, Three.js r128, no build step. Version tv-v29 (build 29, minNative 1) in sw.js, version.json, js/version.js.
Done: APK updater, character looks + multiplayer sync, fishing rework (no fishing panel), sleep in bed, coin icon without "g", birds, title screen + 3 save slots (no preset slots), HUD layout, Vietnamese buildings and props.
Multiplayer: host-authoritative, 6-char code via Cloudflare relay, max 4 players, 8 Hz position sync; shop/land stay local per player.
Patch 9: index.html loads all js/ and css/ files exactly once; sw.js precaches the shell and every js/css/font linked from index.html at install.
Fixed: scatter trees/bushes/rocks and scenery no longer stand inside chill-spot, land-office and furniture-shop footprints (js/layout.js, js/scenery_layout.js); "g" removed from dev money buttons and the furniture-shop coin fallback.
Checks: check.js, chill_check, land_check, furniture_check, scenery_check, solids_check, placement_check, perf_budget, continue_check, look_check, speed/reel/critters/ambient sims all 0 failures.
Not run: no browser or device here; nothing was seen on screen and multiplayer was not tested live.
Next: open on a phone: walk to each chill spot and the Phòng Địa Ốc, check no tree or bush pokes through; two-client join test; build the APK.

## Round 3 - stage 1
- Update loop cause: updater BUILD (27) never matched version.json (28); now one source js/version.js via bump_version.js, ?v=BUILD on all URLs.
- sw.js precache bypasses HTTP cache, version.json network-first; apply = unregister SW + delete caches + reload ?r=ts; 10 min loop guard.
- Settings shows running/latest build. Checks: check.js 0/0, update_check.js ok. Not run: no browser or device.

## Round 3 - stage 2
- Junk cause: castQuality counted pier planks/bridge as shore and used a 2-tile radius; pickCatch rolled junk at cast and on empty lists. Now bad = hopeless only (js/fish_odds.js), junk 60% bad / 1% good, rolled once at bite.
- 'Thả rác' button beside the reel UI for hooked junk (refund bait, no stats). tools/cast_odds.js: good 1.0%, bad ~58%, seat 1.0%.
- Checks: check.js 0/0, reel_sim, cast_odds ok. Not run: no browser or device.

## Round 3 - stage 3
- Market awnings: detail_town.awning() drew one flat disc per tile (overlapping ovals); now one sloped scalloped canopy per stall (+~10% width, trimmed to neighbour), 2 front posts, 0 added draw calls. Hanging nón lá were already 0.4 tile; the big hat is the shopkeeper NPC hat (town.js).
- Bridge noclip: tile-only collision let the body overlap rails/posts and moveBy took one big step. New js/move_core.js (0.2-tile sub-steps, per-axis) + js/thin_solids.js (rail/post solids); player dt clamp 1/20, standUp settles. tools/collision_fuzz.js: 0 events (naive 8620).
- Trees: pine + pink-blossom removed (scenery/layout/far/models); now palm (coconut), fruit, areca-style far trees, spring bloom tint removed. Flag: VN flag + pole on the dinh ridge (landmarks.js cloth mesh, +0 draws). Checks: check.js 0/0, scenery_check, collision_fuzz ok. Not run: no browser.

## Round 3 - stage 4
- Nệm cũ (120g, 1x2, indoor): 4 merged decay variants by days since placement, breaks the morning of day 3 (toast), sell 36g, not storable; placement day saved in furnplace (6th field), works on guests via Time.day.
- New js/beds.js Game.Beds registry (built-in bed, placed beds, mattresses; claim/release) documented in CONTRACT; sleeping on mattresses is not wired yet.
- Checks: check.js 0/0, mattress_check, furn/placement/furniture/seat_furn checks ok. Not run: no browser or device.

## Round 3 - stage 5
Sleep rework (no blanket, spots from Game.Beds, sagging mattress fits, small translucent Zzz beside the head) and late-night exhaustion: no 02:00 pass-out, drain to 0 by ~05:24, vignette, faint clip, same-day (+3 h) or next-morning wake at 30 %.
Verified: check.js 0/0, anim_sample, energy_night_check, mattress_check. Not seen visually (no renderer).

## Round 3 - stage 6
Multiplayer sleep vote: new js/sleep_vote.js (host-authoritative spot claim, day rolls only when all connected are asleep/fainted after 02:00, HUD 'Đang ngủ n/m', tap floor to get up); remote sleepers lie in their spot (avatars.js); faint = bed + wake after 3 h, no clock skip while connected.
Verified: check.js 0/0, sleep_vote_check (38), energy_night_check. Not run: real relay/browser; avatar lying offsets (HIPS 0.26) are unseen.

## Round 3 - stage 7
Settings are tabbed (new js/settings.js, Game.Settings.addTab); all old settings kept: volumes+mute (Âm thanh), Đồ họa+bảng đo+Cỡ giao diện (Hiển thị), Kiểu điều khiển+Camera (Điều khiển), room code (Phòng), mã lưu+Đổi nông trại+Game mới (Dữ liệu), version/update/Hướng dẫn/credits (Giới thiệu).
UI size now 5 steps (xs..xl) over device base 0.8/0.95/1.0, default Vừa; HUD room chip replaced by person icon n/max.
Verified: check.js 0/0. Not seen in a browser.

## Round 3 - stage 8
Compact phone HUD (css/compact.css): pills top-left, icon+time top-centre, n/max + menu top-right, 60px action, 44px slots; safe-area padding kept.
Panels: portrait phone = bottom sheet with sticky close row; landscape <=90% height; furniture shop tabs wrap + side-by-side layout; ?debuglayout=1 overlay (js/layout_debug.js).
Verified: check.js 0/0. Not seen in a browser; sizes judged from CSS only.

## Round 3 - stage 9
Touch controls: float stick anchors at the touch (left half), right-half one-finger camera drag, long-press (350 ms) camera mode with ring in tap-to-move play, fixed stick movable per orientation (Settings preview), camera sensitivity slider.
New js/touch_cam.js, tools/touch_check.js; input.js/joystick.js reworked. Verified: check.js 0/0, touch_check 21/21. Not seen on a device; no camera tilt (rig has none).

## Round 3 - stage 10
Minimap (js/minimap.js, css/minimap.css): cached static canvas + 10 Hz blit, 7 landmark icons, friends, player arrow; tap opens whole-world map with legend; Hiển thị toggle.
Layout: inside #tv-hr under the menu buttons, size 22% of short side (cap 112/140) x UI size, shrinks/hides before touching bottom widgets.
Verified: check.js 0/0, perf_budget ok, minimap_check 44/44. Not seen in a browser; small-landscape fit judged from CSS only.

## Round 3 - stage 11
Remote players: 15 Hz quantised snapshots with host-clock `ts`, one batched `ps` per tick, 4 Hz keepalive, bufferedAmount guard; receivers interpolate 120 ms behind (extrapolate <=150 ms, snap > 4 tiles).
Clock offset via tp/tq (median of 8), ping shown in Settings > Phòng. New js/net_smooth.js, tools/net_smooth_sim.js. Verified: check.js 0/0, sim OK (jitter 50-200 ms, 3% loss, reordering). Not tried on real devices/relay.

## Round 3 - stage 12
Rain rebuilt as world-space: new js/rain_fx.js (streak mesh + splash rings, 2 draw calls, GPU wrap around camera, tile mask for ground/water/roof), old rain/ripple code removed from weather.js (logic, dim, snow, sounds kept).
No screen-space or camera-attached rain remains. Verified: check.js 0/0, perf_budget ok. Not seen in a browser.

## Round 3 - stage 13
Fish shadows rebuilt: new js/fish_school.js (boids + spatial hash + attractors + startle, pure sim) and tools/school_sim.js; FishLife in fishing_fx.js now renders it (4 body shapes, soft texture, depth tint, shader bend + ripple, 1 draw call, 16-40 shadows).
Bite link: shadows within 2.5 tiles shorten the wait and raise fish chance (x1.5-2.5); the nearest nibbling shadow becomes the hooked species. Verified: check.js 0/0, reel_sim, perf_budget, school_sim OK. Not seen in a browser.

## Round 3 - stage 14
New js/vn_life.js: dua, xoai/mit/bang/phuong (red phuong), lua paddies, rau muong, dam but hedges, muop/bau trellises, motorbikes, tôn lean-tos, utility poles with sagging wires; village_vn quotas raised for cau/chuoi/tre.
scenery_far.js: 5 far buildings + a moored boat in one merged mesh, far trees cleared around them. Added draw calls: 6 (5 vn_life + 1 far). Verified: check.js 0/0, perf_budget (136 meshes, 272 geoms), scenery/placement/solids checks, headless layout + geometry smoke tests.
Not seen in a browser: broadleaf tree silhouettes, wire thickness and far-building scale are untuned.

## Round 3 - stage 15A
- Hair crown hardened (cap r +0.01, reach 1.75) in models.js; headless geometry shows full coverage in every hair style.
- tools/preview_char.js + tools/preview_char.py: contact sheets + crown skin check (negative control with a cut crown fails as expected).
- Not verified on a real GPU/phone: the in-game patch may have a render-only cause.

## Round 3 - stage 15B
- New js/head_model.js (before models.js): ellipsoid head (45 % of height), small ears, big glossy eyes (glow, lash line, 2 highlights), blush, tiny nose, smile, vertex-colour gradient; hair cap/hats/bun re-fitted, blink lids rebuilt.
- Verified: check.js 0/0, look_check 745 looks, preview_char crown check OK, close-up sheets (front/3-4/side/top) for 7 looks; head tris <= 1,488.
- Not seen in a browser/real GPU: decal depth offsets (0.0025-0.0145) and NPC sun hat / furniture_shop hat-attach offsets are untuned.

## Round 3 - stage 15C
- models.js: lathe torso+neck, short soft-jointed arms with mitten hands, legs with rounded soled shoes, gradients on every part; clothes (overalls/hoodie/sweater/baba/skirt/scarf) refitted via vertex colour bands.
- Verified: check.js 0/0, look_check 745 looks, anim_sample ok, preview sheet; max 3,442 tris. Not seen in a browser; draw calls stay 14-16 (rig kept).

## Round 3 - stage 16
- New js/char_kit.js (after models.js): layered-lock hair, outfits with sleeves/collar/hem/folds, shell hats (nón lá with chin strap), re-fitted accessories; models.js delegates to it.
- Verified: check.js 0/0, look_check 745 looks 0 failures (max 3,946 tris), preview presets sheets (3 iterations); not seen in a browser/GPU.
- Risk: lock/hat offsets are tuned on the software preview only; low-poly (6-8 segment) limbs and folds look faceted until real-device check.

## Round 3 - stage 17
- Walk/run feet planted (stance slip mean 0.11 walk, 0.3 run), swing-foot lift, 0.12 s fades, weight-shift idle, wave clip, carry pose, spring tails/bow/scarf/pack (js/char_sec.js), remote players use the same locomotion polish.
- Verified: check.js 0/0, anim_sample ok, walk 6 + cast 4 contact sheets; node per-frame cost lower than before. Risk: not seen in a browser; extra spring meshes add up to +10 draw calls for a fully accessorised look, carry sack offset untuned.

## Round 3 - stage 20
- Bald crown: the pole of the hair cap was left bare (whorl locks stop ~0.1 rad short of it, lighter flat cap colour); char_kit whorl() now adds 2 fused centre locks at pitch 1.46.
- Dotted nape/face band was the toon halftone on the 'char' material: models.js char material now halftone:false (hair, skin, clothes). Verified: check.js 0/0, look_check 745 looks max 3946 tris, preview crown OK. Risk: not seen on a real GPU.

## Round 3 - stage 21
- Title: 'Chơi cùng bạn' now swaps the main buttons in place (Tạo phòng / Vào phòng with inline code+name fields / Quay lại; Lobby.open(host, pickSlot, back), no overlay); 'Cài đặt' works (title z-index was above #tv-layer; title shows only Settings, tabs Phòng/Dữ liệu and the guide row hidden); subtitle is 'Mùa · Ngày N' only.
- Brightness cause: #tv-indoor-dim (furn_live, z1 multiply, from house scene + hour of the save) sat above the title; fixed in css/menus.css by hiding it, #tv-night-vig and #house-vignette until body.tv-playing. Several farms: 'Chơi' opens the farm list (the chip is gone).
- Captions/hints: 56 strings removed (title captions, confirmation toasts, tip toasts, 5 contextual hints, 5 guide sub-lines, 4 first-join tips). Kept: errors, stuck-prevention (house start hints, drowsy warning), the guide carousel. Risk: not seen in a browser; farm-list access now only via 'Chơi' when 2+ saves exist.

## Round 3 - stage 22
Icon purge + consistent 24px set (js/icons_set.js), menu icons all distinct, hand icon/finger removed (ripple ring instead).
Dev tools only with ?dev=1 or saved flag. New tools/icon_check.js (0 errors); check.js 0 errors / 0 warnings.
Known: cursor:pointer (system cursor) left on buttons; settings sections still share the 'gear' icon.

## Round 3 - stage 23
Hotbar always one horizontal row (vertical layout removed); HUD buttons react on pointerdown (UI.onPress) so stick/camera fingers do not block them.
Camera drag flipped (world follows finger) + vertical tilt; toggles 'Đảo xoay ngang/dọc' in Settings. touch_check.js extended (36 assertions); check.js clean.
Known: no browser run; vertical drag tilt (±17°) is new behaviour, verify feel on device.

## Round 3 - stage 24
Removed outline wobble (uTick), grain pass and per-vertex width noise; outline is static 1.8 px, dark brown, distance-thinned, same on all tiers.
Grain + vignette moved to CSS layers (overlay draw call removed: -1 per frame); halftone only on terrain/buildings; saturation x1.1; static water glints.
Character/hat checker came from the noisy hull; char material already has no halftone. Checks: check.js 0/0, perf_budget 135 meshes (was 136).

## Round 3 - stage 25
Sleep polish: new js/sleep_look.js + clip hat_off: hands lift the hat off, it rests on the chest (scaled to fit, no body clip for all 5 hats), hand puts it back on waking; eyes closed while asleep/fainted; remote sleepers derive the same from SleepVote.
Hat bug: edge-triggered hide + stored bunWas flags replaced by state derived every frame (Look/saves untouched). Also fixed UI.onPress assigned before UI existed (startup crash).
Checks: check.js 0/0, anim_sample ok, numeric hat-vs-torso check 5 hats. Known: not seen in a browser; hat mesh bbox-fit only, hand/hat contact is approximate.

## Round 3 - stage 26
UI stage 1/4: font tokens --font-ui/--font-display + tools/font_check.js (invalid `font: ... inherit` shorthands fixed), shared .tv-scroll/.tv-hscroll on every panel body and tab row, UI kit (css/ui_kit.css + js/ui_kit.js), pause menu and character creator re-skinned.
Checks: check.js 0/0, font_check OK, look_check, touch_check. Known: not seen in a browser; scroll shadows are background layers, so rows with opaque backgrounds can hide them mid-list; Baloo 2 still loads from Google Fonts.

## Round 3 - stage 27
UI stage 2/4: Kit.panel scaffold (.kp) applied to shops (general, workshop, fish stall, furniture), Túi đồ / Kỹ năng / Sổ tay / Cài đặt menu, chest + bin, goals, notebook, celebration, kitchen.
Phones: bottom sheet + sticky action bar; landscape: list and detail side by side; coin shown as icon + number only; lock reasons now Vietnamese.
Not browser-tested (headless only): check visual fit on a 360x640 phone and a landscape phone first.

## Round 3 - stage 28
- Done: settings (kit tabs/rows/toggle/sliders/segmented, UI-size preview), toasts (kit, max 3), confirm + NPC dialogue + name/code modals, creator polish, farm slots, lobby, update panel, sleep counter, desktop-only tooltips.
- Check: tools/check.js 0/0, look_check, sleep_vote_check, update_check, font_check, touch_check ok. No browser run.
- Leftovers: title-screen buttons (`mn-btn`, menus.css art), tv-card HUD chips, settings sub-rows of Tutorial/Dev (`tv-btn`).

## Round 3 - stage 29
- Done: HUD redesign (hud.css): slim pills, top-right grid, lifted hotbar slot, brief tool name, action button press; DEV badge only with ?dev=1.
- Check: tools/check.js 0/0 (tv-v64). No browser run; layout verified by reading CSS only.
- Leftovers: 320x568 clock drops its day text (<=340px); rotate buttons kept as a small pill under the minimap.

## Round 3 - stage 30
- Done: boot diorama (js/boot_scene.js) from first paint through loading; hand-over snapshot keeps it as the title backdrop; slim progress bar; CSS fallback; empty pill in room menu removed.
- Check: check.js 0/0, boot_scene_check 31/0, perf_budget ok. No browser run.
- Note: the title shows a still of the diorama (game renderer must exist before the title); animating it live on the title needs deferring Render.init.

## Round 3 - stage 31
- Done: tiny garden on the boot island (js/boot_garden.js): 3 plots, hoe/can/seed toolbar, any-order state machine, 0.7 s carrot pop, uproot reset; scene now lives through the title.
- Check: check.js 0/0, garden_check 99/0, boot_scene_check 31/0. No browser run.
- Risk: two WebGL contexts alive on the title (boot + game); boot canvas keeps rendering at 30 fps until the title closes.

## Round 3 - stage 33
- Done: js/world_sync.js (furniture, chest, bin/crate, lamps, land permits via host-validated ops + fix/rollback), chickens/ducks driven by host, weather events for late joiners, guest land catch-up; SYNC MATRIX in CONTRACT.md.
- Check: check.js 0/0, parity_check 44/0 (host + 2 guests, late join in rain, same-tile clash, reconnect). No sync_check.js existed. No browser run.
- Risk: parity_check stubs the relay and net.js wire; real latency/ordering, bee/bird cosmetics and a chest take that races a conflict (bag undo) are untested on devices.

## Round 3 - stage 34
- Profiler overlay (?perf=1): fps, avg/p95, ms split vs budget (red when over), top callbacks, renderer.info, heap, DPR, tier, GPU, 'Sao chép'; zero cost when closed.
- Phone antialias off, hold frame under phone sheet panels, HUD DOM write-on-change, static scenery matrices frozen, scratch objects in audio/furn_live/fishing_fx; tools/perf_scan.js + docs/PERF_REPORT.md.
- Not run: no browser or device; real fps and the stack-based labels (Safari/Firefox formats) unverified.

## Round 3 - stage 35
- Outlines fused into the fill draw call (static meshes + instanced chunks): worst outdoor chunk window 36 -> 22 calls, each fused static mesh -1; characters/critters/fish/farm_fx/far trees keep the old pair.
- EMA dynamic-resolution governor (0.6..tier cap, 1 s down / 4 s up, level backoff), chunk distance LOD, mediump rain/snow, screen-size tier rule; idle 20 fps/sheet pause, grain/vignette CSS, water lite already existed.
- Check: check.js 0/0, perf_budget tightened to 135/272/66. No browser run: the fused shader path and real fps are unverified on devices.

## Round 3 - stage 36
- Boot: Game.Boot marks (?perf overlay line) + time-sliced builds (8 ms chunks, resumable Town/DetailExtra steps); splash text shows build %. Update tiers: Game.SimTier (sim_tier.js) - ambient/birds/bees/fish shadows 20 Hz interpolated, critters by distance, NPC layers shared step, far avatars 10-15 Hz.
- Not run on device: marks are only measured under a node ghost-DOM harness; Scenery, VillageVN, VNLife, Landmarks and one mergeParts call stay single chunks.

## Round 3 - stage 37
- Player actions are visible on every screen: js/remote_act.js (remote fishing rod/cast/line/bobber/bite/reel/splash/catch lift/cancel, held tool byte in the `ps` snapshot, tool clips from {clip, tile}, sitting + seat height); late joiners get `rs`.
- Hooks in avatars.js, `Fishing.targetPos`, net.js tool byte. Matrix rows updated. tools/sync_check.js (real net.js + remote_act.js, fake relay, host + 3 guests): 72 checks. perf_budget +5/+5/+5.
- Not run on device: tool-mesh rest rotation in the remote hand, rod angle when idle and seat height on odd furniture are guessed from the hero code, not seen.

## Round 3 - stage 38
- New clay-style app icon (Togie + nón lá, watering can, sunflower, cottage on a floating island): tools/make_icon.py regenerates every web/PWA/maskable/favicon.ico/Android mipmap asset; gen_icon.py and favicon-48 removed.
- Manifest, index.html links, sw.js precache and check.js updated; android_patch.js also drops template ic_launcher*.webp. tools/icon_files_check.py checks files + pixel sizes.
- Not run on device: adaptive-icon cropping on real launchers and iOS home screen are judged from masks in the preview only.

## Round 3 - stage 39
- Display names: name field in lobby (host + join), Settings > Phòng and character creator; max 14, deduped by host ('Lan 2'), 1 rename / 2 s, live tags via ps.n.
- New msg guest->host {t:'name'}; relay unchanged. tools/name_check.js (27 checks). Not tried on real phones/relay.

## Round 3 - stage 40
- Toon ramp 4/3/2 steps by tier with cool violet shade tint, fresnel rim (characters/props/foliage), per-hour sun colours + mood, weather mood, sky sun glow quad term, baked vertex AO next to buildings/water.
- Water: deeper turquoise->blue gradient, sun glint (tiers 0-1), no foam on tier 3. No new draw calls/passes; PERF_REPORT updated.
- Not run on device: GLSL is only syntax-checked by reading (no GPU here); lamp glows and tree AO untouched.

## Round 3 - stage 41
- Title island rebuilt: organic bay outline, floating tapered rock underside, strata colours, toon/rim/fog shader, baked AO; stray wedge (underside cones) gone.
- Island smaller and lower, pier fully inside the frame (checked 6 aspect ratios incl. sway); no chimney/smoke.
- Not run on device: the new GLSL is only read, not compiled (no GPU here). boot_scene_check data-total fixed to 133.

## Round 3 - stage 42
- Rideable bicycle (js/bike_core.js, js/bike.js): near the house door, Lên xe / Xuống xe on the Action button (tap on the bike also mounts; taps never dismount), 1.5x walk top speed in ~2.5 s, limited turn, one fused mesh with spinning wheels.
- Host-authoritative (bk / bk.q messages, late join, disconnect frees it in place); remote riders drawn seated on it. +1 draw call; tools/bike_check.js added.
- Not run on a device: ride pose and hip height are only read from the code, the bike is not saved between sessions.

## Round 3 - stage 43
- Chimneys removed everywhere (player house model, props farmhouse, land house/office, furniture shop, workshop, kiln, detail_town cap); smoke emitters removed from ambient.js and town_life.js (-2 draw calls: smoke meshes). boot_scene island house already had none.
- Outdoor camera pitch 52 -> 38 deg (-27%), distance 14 -> 15, lookHeight 0.5 -> 0.6; vertical drag may go 14 deg lower (min final pitch 14 deg); indoor/placement unchanged.
- Not run on device: framing and occlusion at the low angle are only read from the code. boot_scene_check data-total failure is older than this stage.

## Round 4 - stage 1
- Fish stall vendor jitter: fish_stall.js applied additive seller gestures (+=) every frame while Town only reset joints at 10-20 Hz (sim_tier); now gated by SimTier.npc.due/dt (sellerStep). Repeat tap no longer restarts a running wave.
- tools/npc_jitter_check.js added (600 frames, 50-100 ms spikes, tier switching, vendor + shopkeeper).
- Not run in a browser; other NPC layers (char_anim, npc_react, char_sec, town idle) were already gated; animals have no joint layers.

## Round 4 - stage 2
- Sit fit: seated pose in `AnimData.SIT` (legs 1.65 = level thighs, underside 0.07 under the hip joint), pelvis rests on the seat surface (root = surface + 0.03) for 6 pier + 6 furniture seat types; backrest contact via `back`/`dz`.
- Skirt/baba lift (<=0.03), hips held while standing, sideways step-off on piers; `tools/seat_fit_check.js` (74 checks) clean with check.js, anim_sample, seat_furn_check.
- Not verified visually (no browser, no side-view sheets); entering still starts from the tile centre.

## Round 4 - stage 3
- Bicycle speed: top 2.2 x walk (4.4 u/s, above run 3.6), 90% in ~2 s, firmer braking; old cap 3.0 was below run speed.
- Capsule collision while riding (1.1 x r 0.3, sub-steps 0.2); collision_fuzz runs it (0 events). Pose from anchors (BikeCore.AN/solve); bike_check has reach + clearance checks.
- Not verified visually (no contact sheets rendered, no browser); the rider is numerically on saddle/grips/pedals only.

## Round 4 - stage 4
- Hair gaps: cap rim ring sat 0.18 x offset (0.004) under the skin shell chord sag, so skin poked through at temples / nape (dotted patch); rim now 0.6 / 0.85 x offset, N 24 (was 22), same M.
- Spiky rim: skull-hugging locks flattened (LOCK_FLAT 0.55 on thickness). Dither / halftone are off for the char material (uDots 0, no fade), so the dots were the poke-through.
- tools/hair_coverage.js: 108 looks x 24 yaws x 18 elevations (10..75 deg), centre rays + 9x9 parallel grid; 0 failing; negative test (hair removed) fails all rays.
- Not seen in a browser; skin allowed only in face window (yaw 70, elev 25) and below the hairline (-3..-30 deg).

## Round 4 - stage 5
- Root cause: Space/Action (PC) cast = first water tile +<=2 => always shallow zone 's' (perch/worm pool); fallback pass also ignored zone; shadow count/attractors varied by quality tier.
- Fixed: FishOdds.facingK, zone-keeping fallback, tier-independent shadows. Added tools/catch_dist_check.js (768 scenarios x 2 devices x 5000 casts). Not seen in a browser.

## Round 4 - stage 6
- Fishing lag causes: all 40 shadows simulated + uploaded at 60 Hz while a line is out; reel UI read clientHeight (forced layout) + wrote glow `bottom` + className every frame, a DOM node + timer per sparkle, drop-shadow filter on the shaking panel; reelTick/tension/charge made 4-5 audio nodes per play at up to 20 Hz.
- Fixed: shadows full rate only within 6 tiles of the bobber, 5 Hz staggered beyond (FishSchool.focus); reel UI transform-only, measured once, 6 pooled sparks; audio `strip` option reuses gain/send nodes; `fishing` mark in ?perf=1. Line/ripples/splashes were already pooled. tools/fishing_perf_check.js: 0 allocs/frame over 300 frames. Not seen in a browser.

## Round 4 - stage 7
- Phone grain came from the full-strength #tv-grain CSS tile (opacity 0.07, 1px speckle) plus world-space water glint specks.
- Fixed: grain opacity <= 0.012, static CSS px; Settings "Hạt giấy" Tắt/Nhẹ (default Tắt on phones); water specks follow it.
- Added tools/grain_check.js. Not seen in a browser.

## Round 4 - stage 8
- Daytime bed = 'nằm nghỉ': 40x clock to 19:00 (Time.advance fixed substeps), half-rate energy, label; from 19:00 real sleep. New js/rest.js, sleep_vote gated at 19:00.
- MP: host counts every connected player (heartbeat rs.hb); fast only when all lie; guests mirror clk+speed. Checks: energy_night_check, sleep_vote_check (60 s host+2 guests). Not seen in a browser.

## Round 4 - stage 9
- Trees redone: no hanging hex plates. Willow slot = wide soft shade tree; oak/birch/fruit/banana/palm + vn_life xoai/mit/bang/phuong/dừa + chill_spots shade tree use smooth-sphere clusters (light top, warm underside), tapered trunks with roots, ribbon fronds, bent tube palm trunk.
- Layout, footprints, collision, instancing, draw calls unchanged (check.js, perf_budget, scenery/solids/placement/chill checks clean). Bamboo, far treeline, title-screen coconut left as is. Not seen in a browser.

## Round 4 - stage 10
- Fish rarity star (icon_badges.js): silver/gold gradient star, bottom-right, from slot quality (species tier where no slot); hotbar, inventory, chest, sell crate, notebook, catch popup, tooltips.
- Hoe/can tiers: new colours, highlight band, glints, rivets, ridges, gem on icon + held model; CSS glint on tiered tool slots; gold tier sparkle via FarmFx burst.
- tools/icon_check.js covers badges; touch_cam.js comment reworded (icon_check false positive). Rods keep the tier ring only.

## Round 4 - stage 12
- House doorway now 2 tiles (x 3..4, frame 3..5; map, spots, walls, mat). Placement refuses pieces that wall off a pocket of free floor or leave a seat/bed without a reachable neighbour tile (PL.reachable(solid, seats)).
- Bike: forced dismount after a scene change parks it at the last outdoor pose (never inside a building). NPCs are static behind counters, animals flee (no collision): verified, unchanged.
- tools/hitbox_audit.js is new (the stage-11 audit/report were not in the zip): doorway, spawns, 480 random layouts on a 0.25 body grid, NPC/shop/bike/teleport rules. Not seen in a browser.

## Round 4 - stage ICON 1
- New hero render of the game's own character (B: straw hat, overalls, red scarf, twin braids, waving, 3/4 view) via tools/render_icon_character.js + .py (real three.js in headless Chromium).
- Outputs in icons/src/: character.png (1024, transparent), character_mask.png, candidates.png (4 variants). Icon files not touched yet (stage 2).
- Readable at 48px (hat + face + blue/red read). Not seen on a device.

## Round 5
- S1: tools/serve.js (static, no-cache, LAN URL), tools/shot.js + tools/shot/ (playwright-core on installed Edge, falls back to EdgeCore exe; presets table, desktop/phone/landscape, --frames, --perf with CPU 4x), js/shot_mode.js (?shot=1: seeded, no saves, dev on, 10:00 sun; panels.js skips title, Dev.set(v, noStore), Farm.devGrow).
- Boot fix: chunks.js loaded before models_props.js and chill_spots.js before seat.js, so Game.Chunks / Game.ChillSpots never initialised (2 console errors per boot); reordered in index.html, boot_scene data-total 133 -> 138.
- Audit fixes: bait/night tips naming removed fish, bamboo rod tip, rice ball text, cooking lock "Cấp"; State.useEnergy carries fractional energy so tool tiers really save x0.85.
- Seen in a browser: shots/baseline (9 presets x desktop/phone, 0 console errors); r4 save loads in this build; perf baseline in docs/PERF_REPORT.md. Visual weak points + open decisions in ROUND5.md.
- S1b (approved list): all 9 Cần anh quyết applied (see ROUND5.md); shot.js presets fishing (cast sequence) + overview (wide map view).
- Trees: village_vn areca/banana/bamboo crowns use Scenery.kit.frond (no flat X blades), village plants placed as 2-4 plant clumps; no sapling size class (scenery_layout), vn_life palms/broadleaves +0.12-0.15 min scale.
- Load order: only chunks.js moved (after models_props); chill_spots no longer needs G.Seat at load. Screens: shots/r5-s1b. Repo: github.com/harieedawwn/togie-valley (Pages from main, Build APK workflow).
