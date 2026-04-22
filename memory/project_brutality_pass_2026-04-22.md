---
name: Brutality pass 2026-04-22
description: Gore/panic/terror upgrades — roadkill, craters, combos, fire chains, grieving couples, dismemberment, blackouts
type: project
---

Session 2026-04-22 landed a big brutality pass on Earth destruction gameplay (main.js):

**New state arrays + counters (~line 264-278):**
`roadkill[]`, `droppedItems[]`, `craters[]`, `bloodFootprints[]`,
`killCount`, `killCombo`, `killComboTimer`, `slowmoTimer`, `killFlashT`, `alienBloodyT`, `_blackoutLevel`.
All reset in planet-load reset lists (~line 10982 and ~22111).

**`registerKill(victim)`** — central kill hook. Increments counter/combo, 60f combo window. At combo ≥ 5 triggers 22f slow-mo (update skipped every other frame). Broadcasts witness panic to humans within 260px/100px Y — they flee away from the kill site. Called from spawnGibs + burning-death + chainsaw + rocket + building-collapse paths.

**Gore decals + step/draw (~line 11327-11535):**
- `stepRoadkill`, `stepCraters`, `stepDroppedItems`, `stepBloodFootprints`, `stepKillStats` — all wired into main step loop after `stepSkidMarks`.
- `drawRoadkill`, `drawCraters`, `drawDroppedItems`, `drawBloodFootprints` — wired into main draw after `drawSkidMarks`+`drawBloodPools`.
- Blood pool life extended 1500→7200 in spawnGibs (persist much longer).

**Bloody alien footprints:** walking through a blood pool sets `alienBloodyT=240`; while > 0 alien drops 3-toe red footprint decals every ~10 distance units (~line 14199).

**Dropped items:** first time a human panics past level 3, they drop a random item (phone/phone/phone/bag/briefcase/groceries/doll) once. Visible as tiny sprite on the ground.

**Fire chain between buildings (~line 3478):** burning building with burnTimer>120 radiates ignition to neighbours every 90 frames within `reach = max(90, b.w*1.1)`. 35-75% chance based on burn intensity. Spawns ember particles jumping to the neighbour.

**Collapsing-building trap (checkBuildingDestroyed):** anyone standing in a building's footprint when it collapses gets gibbed (3-power spawnGibs + registerKill). Crater planted at base. Dust cloud.

**Power grid blackouts:** every destroyed skyscraper/office/apartment bumps `_blackoutLevel` by 0.12 (cap 1.0) and triggers 40f flicker. Apartment + skyscraper window render multiply lit-alpha by `(1-_blackoutLevel)` and flicker during `_blackoutFlicker`. Grid slowly recovers at 0.00015/frame.

**Romeo & Juliet couples:** 6% of eligible Earth humans get paired with a `loverId` (nearest unpaired within 400px). Paired behavior: under panic they run TOWARD each other instead of fleeing. If lover dies/collected/ragdolls, survivor goes into `grieving=true` — walkSpeed near 0, panic=7+, kneels beside body if close. Applied only on modern Earth (skipped in prehistoric).

**Phone-filming civilians:** in the non-panic else branch, civilians within 120-500px of ship during planetTerror<4 have a 35% chance (rolled once per human) to stop and film. Renders a small phone with blue pulsing screen held up in the hand. `h.filming` flag checked in renderHuman tail (~line 20070).

**Praying near churches:** priests always pray when ship within 700px. Other civilians pray if a `buildingType==='church'` is within 140px and terror is 2-6. Reuses the existing `begging` kneeling pose. `h.praying=true` flag set alongside.

**Mass exodus:** at `planetTerror>4`, vehicles get a one-time `_exodusBoost` — set vx to flee direction at 1.8-3.3× base speed.

**Dismemberment:**
- Chainsaw hit: spawns 3-4 extra arm/leg/head limb gibs flying in swing direction + 10 arterial spray particles.
- Rocket splatR hit: 4-6 radial limb gibs + spawnGibs.

**Crater on block slam:** lassoed building hitting ground at vel>5 plants a crater + 12 dust particles + screenshake (~line 11752).

**Screen overlays (end of draw, ~line 15401):**
- Terror vignette: pulsing red radial gradient when `planetTerror>1.5`, intensity scales with terror.
- Kill flash: brief red whiteout (0.18 alpha) during killFlashT frames.
- Slow-mo tint: red desaturation during slowmoTimer + "xN COMBO" text at top-center when combo≥5.

**Deleted/skipped:** Kill counter UI (user said skip), hero civilian (user said skip), sound (user didn't trust), emergency services, zoo riot, terror pulse weapon, civilian militia (deferred to future sessions).

**Why:** User asked to make the game "more brutal and better". Focus was on making every interaction feel weighty and viscerally consequential — persistent gore, cascading chaos (fires spreading, witnesses panicking, lights going out), and emotional beats (couples, phone-filming, praying).

**How to apply:** All new systems respect existing patterns (cap lengths via splice, reset on planet load). To tune intensity, adjust cap sizes (60/30/80), the blackout decay rate, or the combo threshold/slowmo duration. The witness-panic broadcast in registerKill could be gated by LOS raycasting later if too aggressive.
