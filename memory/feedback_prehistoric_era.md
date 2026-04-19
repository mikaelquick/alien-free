---
name: Prehistoric era — no modern human artifacts
description: When window.prehistoricEra is true (68M years ago), no humans, military, flags, astronauts, robots, rovers, or spacecraft should exist on any planet
type: feedback
---

When `window.prehistoricEra` is true (the 68M-years-back era), no human/modern-tech artifacts should exist on any planet — not just Earth. This includes: soldiers/military, police, helicopters, NASA astronauts, SpaceX Starship, American flag on the Moon, rovers/robots, military bases.

**Why:** User flagged that the American flag and "robots" were still visible on the old Moon. The prehistoric era is meant to feel pristine and pre-human — any modern human tech breaks immersion.
**How to apply:** Any spawn or draw code for human-era tech (flags, rockets, astronauts, military units/bases, vehicles, rovers, satellites, antennas) must be guarded by `!window.prehistoricEra`. Check BOTH spawn sites (generate/loadPlanet) AND draw sites (per-planet render branches) — the Moon flag bug was a draw-only leak even though spawn was gated. When adding a new modern-human feature, add the guard up front.
