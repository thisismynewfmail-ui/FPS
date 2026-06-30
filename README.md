# OUTBREAK: 250K — Retro Zombie Survival FPS

A complete, browser-based first-person zombie-survival shooter inspired by *Left 4
Dead*'s invasion mode and the look of early-2000s shooters (Half-Life / PS1-era).
Sprite-billboarded enemies, textured polygonal world, fog, a five-weapon arsenal,
escalating hordes — and exactly **one** way to win: **kill 250,000 zombies.**

> Engine: **Three.js (WebGL)**, bundled into one self-contained file with all
> assets embedded — no build step, no npm install, no internet needed to play.

---

## Run it

**Easiest — just open the file.** `index.html` loads a single self-contained
bundle (`dist/game.bundle.js`) with Three.js and every texture/sprite embedded as
`data:` URIs, so it runs by **double-clicking `index.html`** in a modern desktop
browser (Chrome / Edge / Firefox / Safari). No server required.

> Why embedded? A WebGL game opened from `file://` can't upload *external* image
> files as textures (the browser taints them as cross-origin) — and ES-module
> scripts are blocked over `file://` entirely. Shipping one classic bundle with
> `data:`-URI assets sidesteps both, so the game "just works" offline.

**Or serve it over HTTP** (also fine, slightly faster start):

```bash
cd FPS
python3 -m http.server 8000      # then open http://localhost:8000/
```

Click **PLAY**, then click the canvas to lock the mouse; press **Esc** to pause/release.

### Rebuilding the bundle (only if you edit `src/`)
```bash
pip install Pillow numpy && npm i esbuild
bash tools/build.sh              # regenerates assets, embeds them, bundles to dist/
```
The modular source under `src/` is the source of truth; `tools/build.sh` regenerates
`src/generated/assets_data.js` (embedded assets) and `dist/game.bundle.js`.

### Controls
| Action | Key |
|---|---|
| Move | **W A S D** |
| Look | **Mouse** |
| Sprint / Crouch / Jump | **Shift** / **Ctrl (or C)** / **Space** |
| Fire | **Left Mouse** |
| Sniper scope | **Right Mouse** (sniper only) |
| Reload | **R** |
| Switch weapon | **1–5** or **mouse wheel** |
| Pause | **Esc** |

---

## How the win condition works (no shortcuts)

Each zombie death emits a `zombie:death` event. `src/systems/Score.js` increments the
kill count by exactly **one** per death and checks `this.kills === 250000` with a
strict equality. Victory fires on precisely the 250,000th kill — there is no hidden
trigger, no lower threshold, and the counter is the only path to the victory screen.
The HUD shows live progress (`KILLS: n / 250,000`) and a progress bar.

Reaching 250k in normal play is a long grind by design (the wave system scales toward
huge late-game hordes). For QA there is a **documented, out-of-band developer hook**
(not reachable from gameplay) in the browser console:

```js
GAME.dev.addKills(50000)   // add kills (stops at the 250k victory)
GAME.dev.setKills(249999)  // jump near the threshold, then play the last kill
GAME.dev.godMode(true)     // disable incoming damage while testing
```

This only exists for verification; the in-game victory still requires real kills.

---

## Architecture

Game logic is decoupled from rendering and wired through a shared `ctx` object and an
event bus. Layout mirrors the spec:

```
src/
  engine/      Game loop & orchestration, Input (pointer-lock), Events bus,
               AssetLoader, util (seeded RNG / math)
  entities/    Entity base, Player, Zombie + ZombieManager (pooled) + ZombieTypes,
               NPC (peaceful survivor), Pickup
  weapons/     WeaponDefs (pure data), WeaponSystem (firing, ammo, reload, scope)
  rendering/   Renderer (scene/camera/fog/lights/sky), Billboard (directional
               sprites), Effects (blood pool + screen shake), HUD, WeaponView
  world/       World (seeded procedural map), Collision (AABB + sliding + LOS),
               Nav (BFS flow-field pathfinding)
  systems/     Score (+ win condition), WaveManager, GameState (menu/pause/win/death),
               TimeOfDay (10-minute day/night cycle)
  audio/       Audio (procedural WebAudio SFX — no audio files)
  config/      constants.js (balance), assets.js (single asset manifest)
  generated/   assets_data.js (embedded data: URIs — produced by the build)
assets/        textures/ + sprites/ (+ items/, weapons/) — source PNGs, all via config
dist/          game.bundle.js (shipped self-contained classic bundle)
tools/         gen_assets.py (art pipeline), embed_assets.py, build.sh, smoke_test.mjs
vendor/        three.module.js (Three.js r160, vendored)
```

Key design choices:
- **Directional billboards** (`rendering/Billboard.js`): every entity is a camera-facing
  quad that picks its sheet row (front/back/left/right) from its facing-vs-camera angle
  and cycles 3 walk frames — the classic Doom/Build sprite look. Static geometry
  (walls/floors/ceilings) uses ordinary textured polygons, never billboards.
- **Flow-field navigation** (`world/Nav.js`): a BFS distance field from the player's cell
  is recomputed a few times per second; the whole horde samples a smooth downhill
  direction around obstacles — far cheaper than per-zombie A* and it swarms naturally.
- **Object pooling**: zombies (`ZombieManager`) and blood particles (`Effects`) are pooled
  to avoid GC churn across a 250k-kill run. Off-screen/far zombies are cheaply updated;
  Three.js frustum-culls and fog hides anything past the draw distance.
- **Event-driven systems**: a zombie death updates score, audio and (potentially) the win
  state without any of them referencing each other.

### Extensibility (no core changes needed)
- **New weapon** → append a config object to `weapons/WeaponDefs.js`.
- **New zombie** → add a stat block to `entities/ZombieTypes.js` (+ a sheet in `config/assets.js`).
- **Replace any texture** → drop a PNG with the same name into `assets/…` (paths live only
  in `config/assets.js`). Changing `wall_inside_office.png` re-skins every office wall instantly.

---

## Assets

All world textures are **tileable, power-of-two (256²)**, generated with a retro
palette + dithering by `tools/gen_assets.py`. Sprites use nearest-neighbour filtering.

The pipeline also **processes the provided sprite sheets** (`npc_spritesheet_peacefull.png`,
`npc_spritesheet_zombie_basic.png.png`): they ship on a solid white background with no
alpha, so the tool flood-fills the background to transparent while **preserving interior
white** (the peaceful NPC's hair bow) and de-fringes the edges. The basic zombie is also
tinted into **sprinter** and **tank** variants.

> Note on `wall_inside_office.png`: the originally supplied file is effectively **blank
> white** (luma ≈ 251), unusable as a wall. The pipeline regenerates a proper tileable
> office-wall texture under the same name into `assets/textures/`, so the asset's intent
> and name are honoured. The original remains at the repo root.

Regenerate everything (needs `pip install Pillow numpy`):
```bash
python3 tools/gen_assets.py
```

### Audio
There are no audio files — every gunshot, reload, zombie moan, footstep, pickup chime and
the victory fanfare is synthesised at runtime from WebAudio oscillators + filtered noise
(`src/audio/Audio.js`). Ambient drone + random moans intensify with the nearby horde size.

---

## Optional: automated smoke test

`tools/smoke_test.mjs` drives the game in headless Chromium (Playwright) to catch runtime
errors and capture screenshots. It is **not** required to play.
```bash
npm i playwright-core
python3 -m http.server 8000 &
CHROMIUM=/path/to/chrome node tools/smoke_test.mjs   # screenshots -> ./_smoke_shots/
```

---

## Deliverables checklist

1. ✅ First-person controller — mouse-look, WASD, sprint, crouch, jump, head-bob, sliding collision
2. ✅ 5 weapons switchable on 1–5 / wheel (pistol, shotgun, assault rifle, sniper, bat)
3. ✅ Per-weapon ammo: magazine + reserve, reload (vulnerable), pickups, empty/reload/pickup feedback
4. ✅ Zombie AI: idle → wander → alert (sound) → chase (LOS) → attack → dead, flow-field pathing
5. ✅ Three zombie types (Walker / Sprinter / Tank) with distinct stats, sprites & behaviour
6. ✅ Retro textured surfaces (office wall, brick, concrete, grass, road, wood, metal, ceiling)
7. ✅ Power-of-two, tileable textures
8. ✅ Entity billboarding (zombies, NPC, items always face the camera; directional sprite rows)
9. ✅ Static geometry uses textured polygons, not billboards
10. ✅ HUD: segmented health, ammo counter, circular **Kills / Accuracy / Time** gauges,
    wave indicator, and a top weapon picker that appears only on switch (1–5 / wheel)
11. ✅ Kill counter tracks to **exactly 250,000** → victory
12. ✅ Victory screen with final stats (time, accuracy, kills by type, score)
13. ✅ Procedural SFX for weapons, zombies, pickups, footsteps, victory
14. ✅ Effects: muzzle flash, blood particles, screen shake, damage vignette, death fade
15. ✅ Modular & extensible — weapons/zombies/textures added via data + assets only
16. ✅ 10-minute day/night cycle (sky, sun, fog and ambient light shift dawn→day→dusk→night)
