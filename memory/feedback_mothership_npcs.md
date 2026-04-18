---
name: Feedback - Mothership NPCs (no children)
description: Mothership hub must not contain children; use varied adult crew roles + bots instead
type: feedback
---

- The walkable mothership corridor must NOT contain children (small scale ~0.5 aliens). Wandering NPCs should be varied adult crew roles (officer, scientist, engineer, guard, medic) + non-humanoid bots (maintenance tread-bot, floating probe drone).
- Each role should have specialised accessories painted over the base alien: cap + epaulettes (officer), lab coat + clipboard + glasses (scientist), hard hat + toolbelt + wrench (engineer), helmet + visor + armor + rifle (guard), red-cross cap + coat + medkit (medic).
- Bots must look clearly mechanical — treads, chassis, hazard stripe, sensor eye, welding arm — not just a differently-coloured alien.

**Why:** The user said "we don't need our children to walk around in the mothership, but maybe other characters". Children walking on a military harvest-ship felt wrong; the user wants the space to read as an adult working vessel with specialised crew, consistent with the specialised-visuals rule in `feedback_visual_polish.md`.
**How to apply:** When populating any crew/ambient-NPC list on the mothership or its subrooms (bridge, lab, arena, zoo staff), use adult roles + bots. Never spawn `scale<0.75` alien silhouettes wandering around. Reuse the existing `drawAlienPreview` for the base body and overlay role-specific props.
