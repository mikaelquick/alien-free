---
name: No "abduct N" missions
description: Abduct-type missions were removed from the game — don't reintroduce them
type: feedback
---

Added 2026-04-21. Every `type:'abduct'` mission was stripped from the game:
- `planetMissions` chains (earth/mars/glimora/ice/lava) — all abduct entries removed; chains are now 3 missions each (destroy / terror / survive mix).
- `missionTypes` random-mission pool — abduct removed.
- Planet leader `demands[]` (comms channel) — all abduct demands removed.

Chain-completion thresholds (gold/silver/bronze) now derive from the actual chain length (`planetMissions[pid].length`) instead of hard-coded 5/4/2, so they still work after the removal. The dead-code branch `if(currentMission.type==='abduct') …` in the beam-up handler is harmless and was left in place.

**Why:** User explicitly asked: "remove the 'Abduct 4 colonist' missions and abduct". Abduction is still the core gameplay loop — the player can still abduct freely — but it is no longer a mission objective.
**How to apply:** Do not add new abduct missions to the chains, the random pool, or leader demands. When introducing a new mission type, hook into the same chain-completion infrastructure so the length-derived tier thresholds keep working.
