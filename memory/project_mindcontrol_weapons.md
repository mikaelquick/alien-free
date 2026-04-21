---
name: Mind-control puppet uses alien weapon loadout
description: While mind-controlling a human, Q fires the player's currently-equipped alien weapon from the puppet's body; Tab switches weapons.
type: project
---

Added 2026-04-21.

`mindControlAttack()` (keybinding Q) no longer does a melee swing — it now temporarily swaps `alien.x/y/facing` onto the puppet's position and calls `alienShoot()`, then restores. This reuses the full on-foot weapon pipeline (cooldowns via `alien.weaponCD`, per-weapon effects, particles, shake) so the puppet fires whatever the alien has equipped (stunner, wail, plasma, laser, rocket, acid, chainsaw, etc.).

Tab while mind-controlled cycles the loadout via `alienSwitchWeapon(1)` (wired in the key handler next to Q/F).

**Why:** User wanted mind-controlled humans to have "same skills" as the alien on-foot — not a stripped-down melee-only puppet.
**How to apply:** If you add a new alien weapon, make sure it spawns projectiles from `alien.x, alien.y-14` (the swap relies on alienShoot's world-space assumptions). No separate mind-control branch needed.
