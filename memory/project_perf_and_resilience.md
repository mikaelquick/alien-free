---
name: Perf + entity resilience systems
description: Sim radius culling, stuck detection, ocean bounce, and the per-frame caches added for performance
type: project
---

Added 2026-04-17 during a perf + animal-drowning pass.

**Sim radius (3000px AI cull)** — `_simPX` (player x) is computed at the top of `update()`. Idle humans, grounded cows, vehicles (both Earth + fallback loops), and cave creatures early-return when `Math.abs(entity.x - _simPX) > 3000`. Ragdolled/beaming entities keep updating. Rendering still happens if viewport-visible — this is a *sim* cull, not a draw cull.

**Stuck detection** — grounded cows and vehicles track `_lastX` and increment `_stuckFrames` when movement < 0.3px/frame. At 180 frames (~3s) the entity is removed: cows poof (gray particles), vehicles explode. Guards against spawn-wedge bugs and ocean/home-zone deadlocks.

**Universal ocean bounce** — non-monkey `wack` animals also honor `c.biomeMin/biomeMax`. Cows carry `biomeMin/biomeMax` from spawn (farmland/jungle/snow). Fixed: snow wolves/yetis marked `wack:'monkey'` were previously pinned to jungle bounds (10100-13400) and died marching west; now they stay in their spawn biome.

**Per-frame caches** — `frameNow` / `frameT` (module-scope, updated at top of `draw()`) replace scattered `Date.now()` calls. Gradient caches: `_oceanWaterGrad`, `_oceanSeabedGrad`, `_mountainFarGrad`, `_mountainMidGrad`, `_biomeGroundGradCache[id]`, per-planet `p._atmosphereGrad`/`p._bodyGrad`, and per-block `b._facadeGrad`/`b._trunkGrad` (only cached if `b.fixed`).

**Viewport culling added to** — vehicles + military draw loops. Humans/cows/fires already had it.

**Why:** User reported animals mass-drowning in ocean; investigation revealed bad spawn bounds + stuck entities. Perf was also sluggish on 34000-wide Earth.
**How to apply:** When adding new entity types, copy the sim-radius guard + stuck detection pattern. When caching gradients/positions, key them on stable IDs (biome.id, block if `fixed`) and *never* cache position-dependent gradients on moving entities.
