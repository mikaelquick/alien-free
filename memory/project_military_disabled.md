---
name: Military temporarily disabled (all planets)
description: As of 2026-04-19, military is disabled on ALL planets (Earth, Mars, Glimora, Ice, Lava) and will be reworked later; AI was acting weird
type: project
---

Military spawning is turned off on every planet as of 2026-04-19. `spawnMilitary()` early-returns unconditionally at the top of the function. Earth military bases are also not generated (guarded with `if(false && ...)` in `loadPlanet`). Per-planet spawn blocks (Mars soldiers, Glimora guardians, Ice golems, Lava demons) are still in the source but unreachable after the early return.

**Why:** User asked to remove all military because "they just act weird" — intent is to rework the AI later rather than ship the current behavior.
**How to apply:** Don't re-enable military spawning without explicit user request. When the rework comes, remove the top-level `return;` in `spawnMilitary()` and also restore the `if(false && planet.id==='earth' ...)` bases-generation guard in `loadPlanet`. Wanted-level plumbing (`wantedLevel`, `provokeMilitary`) is still in place.
