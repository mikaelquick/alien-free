---
name: Rockets splatt units like a vehicle run-over
description: Units inside the inner blast radius of a rocket/missile gib+despawn like a car hit, not just ragdoll
type: feedback
---

Added 2026-04-21. Rockets (on-foot `rocket` weapon) and ship-fired missiles (`explodeMissile`) must splatt units caught in the inner portion of the blast the same way a vehicle run-over does — gibs + `h.collected=true` + `vehicleSplatSfx` + `planetTerror += 0.25`. Only fringe units (outside `splatR`) keep the ragdoll+fire+knockback behaviour.

Split radii used:
- On-foot rocket (`rockets[]` loop near `src/main.js:9942`): `R=70`, `splatR=R*0.6`.
- Ship missile (`explodeMissile` at `src/main.js:9348`): `R=120`, `splatR=R*0.55`.

Military inside `splatR` also splatt — but `spawnGibs` expects a humans-shaped object, so for soldiers just emit a burst of blood particles + `m.alive=false` instead of calling `spawnGibs`.

**Why:** User explicitly asked: "if a unit get hit with a rocket the unit should splatt (similar to when you drive over a unit with vehicle)". Ragdoll-only on direct hits felt weak.
**How to apply:** When adding any new AoE weapon that can kill a civilian/soldier outright (grenade, cluster, airstrike, nuke…), include the same inner-radius splatt branch — reuse the `spawnGibs(h, fx, fy-2, power)` + `h.collected=true` + `vehicleSplatSfx` pattern from the chainsaw/rocket handlers. Don't just ragdoll.
