---
name: Recent Session Changes
description: Major changes made in the 2026-04-16 session — game rename, new biomes, ocean, Sun, ships
type: project
---

Session of 2026-04-16 landed these in a single pass:

1. **Game renamed** to "SpaceShip" (was "SAD ABDUCTION"). Changed: `<title>` (line 8) and main-menu text fallback (~line 8540). Logo image `logo.png` is still the primary branding when loaded.

2. **All planets + asteroid unlocked by default.** `unlockedPlanets` now defaults to `planetDefs.map(p=>p.id)` in both `initPlanetProgress` and the load-game fallback. leaderRelations initialized for all 7 canon planets.

3. **New planet: Sun ("Helion")** — `isSun:true`, added to planetDefs, position `(60000, -48000)` in space (moved far-far-away 2026-04-18). Hidden until `p.discovered=true`, which is set when the ship enters `radius + 2500` of the sun's space position. Ship bounds expanded to `spaceWidth+60000` and `-spaceHeight-50000` so the player can actually reach it. Hidden from main space render + minimap until discovered. Sun is also selectable in the Debug → World planet grid for direct unit preview (it has alienTypes: ember, flare, inferno).

4. **Earth expanded to 34000 wide** with new biomes: farmland (6000-9500) with cows/sheep/farmers/barns/silos/farmhouses/haystacks, and snow (16000-19500) with wolves/yetis/snow-capped pines. Jungle now has tigers + parrots in addition to monkeys. Farmland has 2 green "Tractor" vehicles (rendered as green trucks). See project_earth.md for full biome table.

5. **Ocean: visible sandy seabed + much more life.** Seabed gradient brightened (#c8a868→#5a4020) with a surface highlight band and deterministic speckles. New creature types with full render branches: kelp (tall swaying), starfish, crab (walks on seabed, clamps dir at oceanBounds), sea turtle (swims), shark (mid-deep, menacing), seaRock (decorative), shell. Counts boosted: seaweed 25→60, coral 18→40, fishSchool 12→22, jellyfish 8→18, whales 1→2, anglerfish 2→4, shipwreck 1→2, treasure 3→5. Ocean bounds now derived from `earthBiomes.find('ocean')` into global `oceanBounds` which wrap logic uses (fishSchool, whale, anglerfish, crab, turtle, shark).

7. **Settings → rebindable controls with context tabs (2026-04-18).** Main-menu "Settings" opens a key-rebinding list. Each `KEY_ACTIONS` entry has a `context` of `'ship'`, `'foot'`, or `'both'`. The menu has three tabs (ALL / SHIP / ON-FOOT, switched with A/D) that filter the action list. Rebinds persist via `localStorage('sadabduction_keybinds')`; a `_physToCanon` map translates physical→canonical keys in the global keydown/keyup hook so game code still reads canonical keys (e.g. `keys['a']`). "PRESS ANY KEY..." blocks tab-switching and ESC while awaiting. Reset-to-defaults + Back are the last two rows.

6. **Ship skins → ship types.** SHIP_PAINTS gained a `ship` field (saucer/xwing/tie/falcon/wedge/rocket/shuttle). New `drawShipBody(pc,pa,pt,type)` helper dispatches rendering; the old single-shape saucer code is the fallback. New variants added: X-Fighter (xwing), Twin-Ion (tie), Smuggler Freighter (falcon), Imperial Wedge (wedge/star-destroyer), Retro Rocket (rocket), Orbital Shuttle (shuttle). Ship-skins menu preview uses the same helper so each type is actually shown. `shipPaint.ship||'saucer'` fallback ensures old saves still work.

**Why:** User requested all of these over the course of the 2026-04-16 session as rapid-fire additions.
**How to apply:** If the user asks about "the ship I selected" or "the sun planet" or "farmland" — these are real features now. For adding more ship types, extend the `drawShipBody` switch and add a SHIP_PAINTS entry with `ship:'newtype'`.
