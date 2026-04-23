---
name: Session 2026-04-23
description: Moons, planet music, vehicle deploy drop, drive-over animals, Sun biology, ship flight feel
type: project
---

Session 2026-04-23 changes (on top of 2026-04-22 brutality/reality passes):

**Planet roster grew** — four landable moons added: Europa (Jupiter), Io (Jupiter), Titan (Saturn), Triton (Neptune). Orbit their parent via `orbitsParent` + `moonOrbitRadius` + `moonOrbitYears` (Triton is retrograde). Gravity scales tuned to reality (Europa 0.13, Io 0.18, Titan 0.14, Triton 0.08). Translation entries added to the English `planet` block in src/translations.js so `tr('planet.europa.name')` returns "Europa" etc.

**Planet background music** — sun-music.wav (Sun), mercury-music.wav (Mercury, keyed as 'lava'), moon-music.wav (Moon). All slot into the existing `planetMusic` dict and cross-fade via updateAmbience.

**Ship-interior hum sound was trialed and removed** — user decided it "sounded weird". Don't reintroduce without explicit ask.

**Vehicle deploy from any altitude** — `ejectFromShipIntoVehicle` no longer altitude-checks. The vehicle spawns at `ship.y` with `_deployFalling=true`, falls with `BASE_GRAVITY*1.2` while syncing the alien to the cabin, trails dust, and on ground impact plants skid marks + dust cloud + screenshake. See main.js `if(v._deployFalling)` branch in the drivingVehicle update.

**Drive-over splats extended** — hijacked vehicle now also gibs animals (cows/sheep/monkeys/tigers/camels; color-matched particles + debris using `c.color/c.spots`) and military foot units. Previously only humans.

**Sun biology** — Sun wildlife replaced. `COW_TYPES.sun` = Plasma Wisp / Solar Slug / Corona Beast (fire/glow wack), and `generateCows` has an `isSun` branch that spawns 2–4 of them, skipping earth cows/sheep/etc.

**Block splat on free blocks** — when a lassoed/thrown block moves at speed > 3, any human/cow/military unit inside its footprint is splatted like a vehicle run-over.

**Dome-pod glass base ring removed** — visual cleanup, the dark ellipse at y=-2 that looked like a transparent line.

**Sun burn death** — stepping onto the Sun on foot triggers `window._sunDeath = {t, duration:180}` — alien renders with charring oval, fire licks, and ember ring for 3 seconds, then respawns at the ship. Skipped if driving a vehicle.

**Beam strength fix on high-gravity planets** — beam pull recalculated from `BASE_GRAVITY*1.15+0.15` instead of `GRAVITY+0.15`, so Sun/Jupiter beam behaves the same as Earth beam.

**Vehicle world-edge wrap** — replaced the worldWidth clamp (caused the "invisible wall" bug on non-Earth planets) with seamless wrap via `if(v.x<0) v.x+=worldWidth; else if(v.x>worldWidth) v.x-=worldWidth;` in updateAlienOnFoot.

**See also:** project_spaceflight_feel.md for the ship-turning animation + back-exhaust work.

**Why this session:** user wanted more variety (moons), richer atmosphere (planet music), and better flight feel. Several ship types looked like they were flying backward; asymmetric vs symmetric handling now fixes that.
