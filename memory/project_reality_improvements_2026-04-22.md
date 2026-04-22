---
name: Reality improvements 2026-04-22
description: Atmospheric / immersion pass — storms, ocean life, reflections, crystal gate, volcanic island, fire scars
type: project
---

Session 2026-04-22 landed these atmosphere upgrades on Earth (main.js):

1. **Storm system** — `window._stormPhase` oscillates slowly, `window._stormK` computed per-frame with biome modifier (jungle/ocean peak, desert suppressed). Rain rate + speed scale with stormK. **Lightning flash** (`window._lightningFlash`, 10-16 frame countdown) during heavy storms with jagged screen-space bolt path (`window._boltPath`) and screenshake. Screen-space dark overlay darkens sky during storm. Weather update loop: ~line 11005.

2. **Desert sandstorm** — `window._sandstormPhase` oscillates, independent of storms. When in desert biome only: new `sand` weather type (horizontal streaks) + particle haze + full-screen tan overlay when intense.

3. **Heat shimmer in desert at noon** — 3 wobbling sine bands above ground, drawn in screen-space overlay block. Fades out during sandstorms.

4. **Ocean night bioluminescence** — underwater render (`_bioK = 1 - dayNightBrightness*1.5`): seaweed tips get pulsing green-teal glow at night; coral gets pink halo pulse. Jellyfish already pulsed.

5. **Seagulls** — `window._seagulls` array; spawn over ocean during day, simple M-stroke drawing with flap cycle. Despawn off-screen or at life end. Cap 6.

6. **Crystal gate (seabedCave upgrade)** — the existing seabedCave entrance got: outer radial cyan halo, 4 faceted crystal columns flanking (diamond-polygon silhouette with highlight edge), 4 rotating crystal shards floating inside the mouth. Still enters the `pyramidInterior` in `theme='cave'`.

7. **Ship water reflection** — at drawShip call (~line 15082), when over ocean and above water: draws a mirrored+dimmed ghost ship at `GROUND_LEVEL + (GROUND_LEVEL-ship.y)`, alpha fades with altitude (500px max), slight horizontal wobble.

8. **Volcanic island** — fixed visual-only set-piece at worldX=47000: island silhouette, beach halo, palm trees with frond sway, crater rim, lava glow, smoke plume with drift, eruption particles during `window._volcPhase` peaks. Currently NOT walkable (no solid ground in ocean biome).

9. **Fire scars** — dying ground fires spawn an ashPile with `scorch:true` + `size`. Scorch branch in ashPile render draws wide flat black+brown ellipse on ground, fades over 600 frames.

10. **Mountain Observatory interior** — new `mountainObservatory` buildingType placed in mountains biome at wx 7500-7560 (stone tower + dome + telescope poking through slit + door at base). Enter with E near door to trigger `pyramidInterior.theme='observatory'` — a new theme in drawPyramidInterior with starry-sky background, wooden floor, dome oculi in ceiling showing stars, star-chart wall panels, wooden bookshelves as pillars, brass hanging lanterns, brass-tripod telescope replacing sarcophagus, star-chart parchment reveal, moonlit exit door. Reuses the same 4-plate glyph puzzle; reward is +50 stardust. Aurora previously softened to 0.04/0.03 alpha.

11. **Arctic Radar Base interior** — new `radarBase` buildingType placed in snow biome at wx 2700-2760 (concrete bunker + antenna mast with rotating radar dish + blinking warning light + blast door). Enter with E near door to trigger `pyramidInterior.theme='radar'`. Interior has steel grating floor, concrete/pipe ceiling with flickering fluorescents, wall-band CRT monitors with scanning blips, server-rack columns with blinking LEDs, industrial amber cage lamps, central radar console (PPI sweep + keyboard + LED panels) replacing sarcophagus, hologram "CLASSIFIED INTEL" reveal, hazard-striped blast door with snow drift spilling in. Reward: +50 intel credits.

12. **Jungle Temple interior** — new `jungleTemple` buildingType in jungle biome at wx 31000-31070 (mossy step-pyramid + swaying vines + gold jaguar idol on top). Theme `jungleTemple` renders: dark green canopy background, mossy stone floor with flagstones/moss/leaves, mossy ceiling with dripping vines + gold glyphs + hanging vines, carved frieze wall panels with glyphs, stone columns wrapped in vines, green ritual torches with eerie halo, massive golden jaguar idol replacing sarcophagus (eyes glow green when unlocked, rays, bobbing anim), gold offerings + floating green spirit orbs on reveal, overgrown stone archway exit. Reward: +50 sacred gold.

13. **Abandoned Subway interior** — new `subwayEntrance` buildingType in city biome at wx 21500-21560 (stairwell with blue-red "M" roundel sign + railings + warm yellow spill). Theme `subway` renders: dark tiled background, platform-tile floor with yellow tactile strip + litter, arched tiled tunnel ceiling with flickering tube lamps, wall band with "CENTRAL STATION" panels + graffiti ("VOID 77", "ABDUCT OR DIE"), I-beam pillars with rust streaks and "WANTED ALIEN" posters, harsh fluorescent tubes with faulty flicker, abandoned red Line 7 subway car replacing sarcophagus (broken window, doors slide open on solve, visible rails/ties under it), cash+gold tokens+duffel bag stash on reveal, stairwell-up exit with EXIT sign. Reward: +50 stolen cash.

14. **Haunted Root Cellar interior** — new `cellarHatch` buildingType in farmland biome at wx 12000 (earthen mound + slanted wooden hatch + "KEEP OUT" sign + green glow through cracks). Theme `cellar` renders: dark earth bg, dirt floor with tree roots + eerie green puddles, wooden floorboards from above ceiling with dangling cobwebs/roots, earthy wall with rotten shelves of glowing alchemy jars, wooden post pillars with hanging herb bundles, old iron oil lanterns, bubbling green witch's cauldron over firewood replacing sarcophagus (cauldron erupts with green spirit orbs + floating potion vials on solve), slanted wooden hatch exit up to farmhouse yard. Reward: +50 witch's brew.

15. **Conspiracy Basement interior** — new `conspiracyHouse` buildingType in suburbs biome at wx 17500 (suburban house with blackout/boarded windows, multiple antennas, satellite dish, "NO VISITORS" sign, glowing peephole). Theme `basement` renders: dim gray/brown bg, scuffed concrete floor with stains/cracks/dust, exposed joist ceiling with tangled wiring + flickering bare bulbs, corkboard wall with photo grid + red string connecting them + "THE TRUTH IS OUT THERE" scrawl, wooden stud pillars with pinned newspaper clippings ("UFO SEEN"), harsh hanging pendulum bulbs, large corkboard with evidence photos + red strings + classified file cabinet replacing sarcophagus (pattern resolves to glowing X-marked map + spinning USB drive on solve), wooden stairs up to the conspiracy house. Reward: +50 secret dossiers.

16. **Museum Vault interior** — new `museum` buildingType in landmarks biome at lp 3000 (neoclassical marble with 6 fluted columns, triangular pediment "MVSEVM", brass double-doors, "ANTIQUITIES" plaque). Theme `museum` renders: warm amber bg, polished marble floor with red runner carpet + gold trim, ornate coffered marble ceiling with gold trim band + hanging chandeliers, framed painting gallery wall band, fluted marble columns with gilt capitals + "CA. 1200 BC" plaques, wall-mounted brass sconces with candle flames, brass-framed glass display case containing alien crystal skull replacing sarcophagus (eyes glow cyan on solve, glass cracks, floating gold coins + light rays burst out), grand brass double doors with pediment exit to museum lobby. Reward: +50 antiquities.

**Task 7 COMPLETE**: 8 themed interiors now exist — observatory (mountain), radar (snow), jungle temple (jungle), subway (city), cave (ocean, reframed as Crystal Depths), cellar (farmland), basement (suburbs), museum (landmarks) — plus original tomb (desert). All share the same 4-plate glyph puzzle mechanic; differ entirely in visual theme and reward flavor. All Earth biomes now have a hidden interior dungeon.

**Why:** User asked for "reality improvements" and specifically wanted the Crystal Depths entrance under the ocean on Earth — done as #6. `window._stormK`, `window._sandK`, `window._boltPath`, `window._seagulls`, `window._volcPhase` are all globals that can be tuned.

**How to apply:** To disable any of these, zero the controlling global. To add another biome storm modulator, extend the `biomeMod` branch in the weather block. Volcanic island position is hard-coded at x=47000 — move it by changing that literal.
