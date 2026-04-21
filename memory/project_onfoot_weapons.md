---
name: Alien on-foot weapon system
description: Alien on-foot loadout — race-specific weapons, chainsaw-first slot, V-cloak, projectile arrays, HUD
type: project
---

Added 2026-04-17, extended through 2026-04-20. On-foot alien has a race-specific weapon loadout (Tab cycles, Q fires, 1..N select).

**Loadout** — `getRaceWeapons()` returns the race's array from `RACE_LOADOUTS`. Alien state has `weapon` (index) and `weaponCD[]` (per-slot cooldown frames). **Chainsaw is always slot 0 for every race** (2026-04-20 user request).

**Weapon library** — `ALIEN_WEAPONS` (id, label, cd, color). Core set:
1. **Stunner** (cd 30) — short cone `stunWave`, stuns humans + military 120f.
2. **Wail** (cd 260) — radial panic burst (`shouldPanic` on humans, `stunTimer=60` on military).
3. **Plasma** (cd 22) — arcing `plasmaBolt` with gravity, explodes on impact.
4. **G-Well** (cd 540) — thrown `gravityWell` arms → pulls entities 150f → detonates.
5. **Swarm** (cd 420) — spawns 4 `parasites` that seek, attach, damage over time.
6. **Laser / Rocket / Acid / Chainsaw** — race-specific additions. Chainsaw has spinning teeth only when `chainsawRev>0`, splats humans like vehicle run-over (`spawnGibs` + `vehicleSplatSfx`), uses `chainsaw-cut.wav` at very low volume.

**Arrays** — `stunWaves[]`, `plasmaBolts[]`, `gravityWells[]`, `parasites[]`, `ashPiles[]`. Reset in `leavePlanet()` and on planet load.

**Dispatch** — `alienShoot()` switches on weapon id (not index). `updateAlienWeapons()` ticks each array. HUD draws N slots with cooldown bars.

**On-foot cloak (V)** — `alienCloak = {active, energy, maxEnergy, drainRate, rechargeRate}`. V toggles when on-foot outside ship/mothership/pyramid, with energy gate. Body draws at `globalAlpha≈0.18` with subtle pulse when active. Military check uses `alienCloak.active && playerMode==='onfoot' && !alien.drivingVehicle` to skip detection.

**Mothership use** — `fireMothership()` re-implements firing for the hub corridor + comms walk using the same loadout; see project_mothership_hub.md.

**Why:** User asked for on-foot weapon variety, then specific additions (chainsaw splatter, first-slot chainsaw, V-cloak).
**How to apply:** New weapons → extend `ALIEN_WEAPONS`, add the id to the right races' `RACE_LOADOUTS` entries, add a branch in `alienShoot()`, add a tick branch in `updateAlienWeapons()`, and add the range/radial case to `fireMothership()` if it should work in the hub. Apply sim-radius culling to any new projectile arrays that can persist.
