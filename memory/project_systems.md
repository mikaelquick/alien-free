---
name: Game Systems Overview
description: Key game systems — skins, save/load, menus, caves, vehicles, day/night
type: project
---

- **Main Menu**: Canvas-rendered with Continue/New Game/Alien Skins/Ship Skins. Stars + animated alien preview.
- **Pause Menu**: ESC during gameplay. Resume/Save/Save & Quit to Menu.
- **Save System**: localStorage key `sadabduction_save`. Auto-saves every 30s and on planet leave. Stores score, upgrades, skins, unlocks, specimens, etc.
- **Alien Skins**: 10 skins stored in `ALIEN_SKINS` array. Selected via `selectedSkin` in localStorage. Uses `skinTint()` to blend gray body colors with skin colors. `drawAlienPreview()` renders detailed alien at any position/scale.
- **Ship Skins**: `SHIP_PAINTS` array (7 paints). Stored in localStorage `sadabduction_shippaint`.
- **Cave System**: `underwaterCaves` array, each with segments. `isInsideCave(x,y)` checks if point is in any segment. Segments can be `dry:true` (walkable), `shaft:true` (vertical), `chamber:true` (large room), `mountainEntrance:true` (visible from surface).
- **On-Foot Mode**: Enter to exit/enter ship. Alien walks, jumps (space), jetpacks (shift), shoots (Q). Cave collision for floor/ceiling/walls. Camera follows alien.
- **Vehicles**: Cars, trucks, buses in city/suburbs/desert. Stay in home zone.
- **Day/Night**: Sun + moon opposite each other. Sun position drives `dayNightBrightness`. ~3.5 min cycle tied to planet position.
- **Zoo Walk Mode**: X key in zoo screen. Side-scrolling walkable view.
**How to apply:** When modifying any of these systems, check this overview to understand dependencies.
