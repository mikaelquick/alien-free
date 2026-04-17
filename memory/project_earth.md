---
name: Earth World Design
description: Earth biome layout (EARTH_WORLD_WIDTH=34000), biome ranges and population counts
type: project
---

Earth world width: **34000** (expanded from 24000 on 2026-04-16 per user request for more biome variety).

Biomes in order (defined in earthBiomes array near line 982 of index.html):
- City (0-3500): 18 people, vehicles (6), skyscrapers/apartments/churches
- Suburbs (3500-5500): 8 people, 3 vehicles, houses/cottages
- **Farmland (6000-9500)** NEW: 10 farmers, 2 green tractors, cows, sheep, barns/silos/farmhouses/haystacks
- Jungle (10000-13500): 6 indigenous, jungle animals (monkeys/tigers/parrots), dense trees/huts
- Mountains (14000-16000): 3 hikers, rocky pines — `isMountain:true`
- **Snow (16000-19500)** NEW: 4 people, wolves/yetis, snow-capped pines + igloos + ice castles — `isMountain:true, isSnow:true`
- Desert (20000-23500): 5 merchants, 2 trucks, mosques/adobe/markets/cacti/palms
- Landmarks (24000-27000): 5 tourists, Statue of Liberty/Eiffel/Big Ben/Leaning Tower (lp offset auto-derived from biome.from)
- Beach (27300-27900): palm trees, beach huts
- Ocean (27900-34000): fish, coral, shipwrecks, whales, sharks, turtles, crabs, starfish, kelp, shells, seaRocks, jellyfish, anglerfish, shipwrecks, ruins, treasure

Military bases auto-derived from biome mids: city-mid, mountains-mid, landmarks-mid.
All coord-dependent code (cows, vehicles, NPCs, military bases, landmark offset, jungle-confinement) now derives positions from `earthBiomes.find()` so future biome rearrangement is safe.

Caves remain disabled (feedback_removed_features.md).

**Why:** User wanted Earth "larger so we can split up the world more" with snow+mountains, jungle+animals, town+vehicles, farm+farmers/cows/sheep (2026-04-16).
**How to apply:** When adding new content to Earth, use `earthBiomes.find(b=>b.id==='X')` rather than hardcoding coordinates.
