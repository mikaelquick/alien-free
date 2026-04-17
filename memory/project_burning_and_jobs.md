---
name: Burning humans + job commuting
description: Humans now commute to work on a day/night cycle and burn down to ash piles when ignited
type: project
---

Added 2026-04-17.

**Job commuting** — Humans in city/suburbs/landmarks/farmland biomes get a `workX` stored at spawn (±400-1000px from home, never over ocean). `behavior='commute'` uses `dayNightCycle`: day (<0.25 or >0.75) heads to `workX`, night heads to `homeX`. On arrival, `walkSpeed=0`. This replaces the old aimless idle wander for these biomes.

**Burning** — Human fields: `onFire`, `burnTimer`, `ignitionCD`. When `h.onFire`:
- Walk direction flips every 22 frames (panic scramble), speed 2.2.
- Fire particles emitted each frame, `panicLevel` increments.
- Spreads to nearby humans via `ignitionCD` throttle (~60f cooldown).
- Ocean extinguishes.
- On `burnTimer<=0` → push to `ashPiles[]` and `h.collected=true`.

**Ash piles** — `ashPiles = [{x, y, life, maxLife}]`. Rendered before fires (~line 7355) as dark ellipse + smoldering wisp particles. Fade over ~15s.

**Flame overlay** — `renderHuman` draws 3 flame tongues at head/body/legs anchors when `h.onFire`.

**Reset** — Cleared in `leavePlanet()` alongside fires/particles/weapons.

**Why:** User asked for "more life and beauty — people walking to jobs, burning humans should burn and become ash after running around."
**How to apply:** When adding new human behaviors, put `onFire` branch first in the behavior dispatch (overrides panic/terror). For new biomes that should commute, add to the `commuteBiomes` list in human spawn (~line 1905).
