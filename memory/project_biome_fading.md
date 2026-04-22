---
name: Earth biome fading
description: Wide smooth biome transitions on Earth — ground, weather, population all blend
type: project
---

Earth biomes fade into each other via `earthTransitions` zones (src/main.js ~line 996). Each
transition defines a `{from, to, biomeA, biomeB}` range — inside it, `getEarthBiome(x)` returns a
blended biome (`id:'transition'`, `fromId`, `toId`, `blend`, lerp'd groundColor/grass/trees).

2026-04-22b widening:
- Transitions now ~4000–5500 px wide (previously 2500–3000). Each zone spans well past the biome
  junction so the player sees a long gradient (e.g. snow↔mountains: 2500→7500 covers half of snow
  and half of mountains).
- `getBiomeIntensity(x, biomeId)` — returns 0..1 for a single biome id; particles, weather, sand
  haze, snow weather all use it so atmospheric effects fade together with visuals.
- **Populator fix**: `generateBuilding` (line ~1466) and `generatePrehistoricFlora` (line ~1616)
  now stochastically pick one of the two transition biomes (weighted by blend) so in transition
  zones you get a gradual mix of biomeA and biomeB units. Before the fix, transition biomes fell
  through the biome.id branches and defaulted to city buildings everywhere.

**Why:** User complaint "snow just started, same with desert — I want the environment to fade
together, not jungle → desert". The narrow transitions felt like hard cuts.

**How to apply:** To make a specific biome blend even more gradually, widen its transition entry
in `earthTransitions`. Don't let the transition extend past the biome's own `from`/`to`, or the
blend will overshoot. The biome list starts with snow (wraps at EARTH_WORLD_WIDTH) — there's no
transition across the wrap point, so the ocean→snow junction is still a hard cut.
