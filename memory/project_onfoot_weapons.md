---
name: Alien on-foot weapon system
description: 5-weapon loadout for the alien when playerMode='onfoot' — projectile arrays, keybinds, HUD
type: project
---

Added 2026-04-17. On-foot alien has 5 selectable weapons (keys 1-5, Tab cycles, Q fires).

**Weapon definitions** — `ALIEN_WEAPONS` (id, label, cd, color) at top of main.js. Alien state has `weapon` (index) and `weaponCD[5]` (per-slot cooldown frames).

1. **Stunner** (1, cd 30) — short cone `stunWave` (kind:'cone'), stuns humans + military for 120f. Cheap spam.
2. **Wail** (2, cd 260) — radial panic burst, sets `shouldPanic` on humans, `stunTimer=60` on military.
3. **Plasma** (3, cd 22) — arcing `plasmaBolt` with gravity, explodes on impact (`plasmaExplode()`), damages humans + buildings.
4. **G-Well** (4, cd 540) — thrown `gravityWell` arms → pulls entities 150f → detonates. High-value crowd control.
5. **Swarm** (5, cd 420) — spawns 4 `parasites` that seek nearest target, attach, damage over time.

**Arrays** — `stunWaves[]`, `plasmaBolts[]`, `gravityWells[]`, `parasites[]`, `ashPiles[]`. All reset in `leavePlanet()` and on planet load.

**Dispatch** — `alienShoot()` switches on `alien.weapon` index. `updateAlienWeapons()` ticks each array. HUD at ~line 8170 draws 5 slots with cooldown bars.

**Military stun** — entities with `stunTimer>0` early-return and emit blue sparks every 6f (`main.js:2660`).

**Why:** User asked for more on-foot weapon variety; the single-weapon grab-and-go loop was too thin.
**How to apply:** When adding more weapons, extend `ALIEN_WEAPONS`, extend `weaponCD` init, add a branch in `alienShoot()`, and a tick branch in `updateAlienWeapons()`. Always apply sim-radius culling to new projectile arrays if they can persist.
