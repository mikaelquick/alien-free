---
name: Mothership combat + permadeath
description: Player can use full weapon loadout inside mothership hub; NPC deaths persist across reloads.
type: feedback
---

Weapon combat must be usable in the mothership hub (menu corridor + comms walk) with the same weapons as on planet. Killed NPCs (crew, operators) stay dead for the current savegame — they never respawn.

**Why:** Stated 2026-04-20 — "you should also be able to use all weapons that you can use when you are outside the ship. and if you kill a npc it's dead for that savegame." Fits the established power-fantasy framing: the player is the threat; the mothership isn't a safe zone with magic revival.
**How to apply:** If adding new walkable mothership rooms with NPCs, wire Q/Tab into that room's update branch and render `mi.fxParticles` inside its zoom transform. Populate NPCs in `enterMothership()` guarded by the relevant `msDead*` set, and mark `c.dead=true` + save on kill. Don't add temporary-kill or respawn logic without explicit ask.
