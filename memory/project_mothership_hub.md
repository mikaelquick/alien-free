---
name: Mothership walkable hub + new screens
description: Mothership main menu is now a walkable corridor with doors. Added Star Map, Training Arena, Specimen Lab, Zoo Riot.
type: project
---

Added 2026-04-17. Replaced the 3-card center menu with a walkable corridor. 5 new screens.

**Walkable hub** — `mi.hub = {x, vx, facing, walkT, doorX[], nearDoor, width}`. A/D walks, SPACE enters nearest door (within 70px). Doors are evenly spaced along `hub.width=1800`, one per `MS_MENUS` entry. Camera follows alien. Draw at `drawMothership()` menu branch — corridor with ceiling light strips, viewport windows with scrolling stars, animated alien sprite with walk cycle.

**MS_MENUS** now 8 entries: `bridge`, `starmap`, `comms`, `lab`, `arena`, `zoo`, `upgrades`, `stats`.

**Star Map** — `mi.starmap={sel, surveyCD}`. Horizontal planet selector with progress + completion rank. SPACE jumps to unlocked planet (calls `exitMothership()` → `leavePlanet()` → `loadPlanet()` with 50ms gap to avoid race). Locked planets show lock icon.

**Training Arena** — `mi.arena={active, mode, time, score, ghosts[], _beamX, beamActive, announce, resultTimer}`. 3 modes (easy/medium/hard: 20/25/30s, 8/14/20 ghosts). Player-controlled beam at top of screen, ghosts flee when close. Bronze/Silver/Gold scoring → 10/18/30 pts.

**Specimen Lab** — `mi.lab={station, specIndex, running, t, bar, barDir, sweetLo, sweetHi, outcome, outcomeT}`. A/D picks specimen, SPACE starts timing minigame (moving bar, randomized sweet zone). Hit sweet spot = +5-10 pts. No specimens = friendly message.

**Zoo Riot** — `mi.riot={active, escapees[], defended, lost, spawnT, duration, trigger}`. 25% chance on entering zoo (if ≥3 specimens). Escapees run; stun with Q in zoo walk mode within 80px. Red-strobe overlay + HUD. Must defend ≥3 or timer elapses to end.

**Entry point** — `maybeTriggerRiot()` called when entering zoo door. Active riot draws overlay on top of zoo via `drawZooRiot()`.

**Why:** User asked for "big improvements" to the mothership. Walkable hub makes it feel like a real ship; the drill/lab/starmap/riot give the hub meaningful activities.
**How to apply:** When adding more screens, push a new MS_MENUS entry, add an update fn, add a draw fn, dispatch in `updateMothership` + `drawMothership` after menu early-return. For door screens that start a minigame, init per-run state in `enterMothership()` and clear on exit if needed.
