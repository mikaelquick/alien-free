---
name: Feedback - Exploration and adventure focus
description: Game prioritises adventure/exploration/feeling over completion; hidden themed interiors per planet; auto-equip gear
type: feedback
---

- The game is about **adventure, exploration, and feeling** — NOT about finishing missions. Design every feature to make the world feel discovery-rich and fun to wander in.
- Every planet should have one or more **hidden interiors** accessed by walking/swimming into a special spot in the world. These must be themed per-planet:
  - Khet (desert) → open pyramid → tomb interior (DONE)
  - Earth ocean → glowing seabed cave mouth (requires dive suit) → bioluminescent cave interior (DONE)
  - Other planets should follow the same pattern (Mars bunker hatch, Glimora crystal geode, Ice frozen cave, Lava magma tube, Asteroid mining shaft). Each interior reuses the `pyramidInterior` state machine with a new `theme` value.
- Gear should **auto-equip on first encounter** rather than gated behind stores/menus — e.g. jumping into water auto-deploys the dive suit with a brief flash and `showMessage`. Keep gear discovery frictionless.
- Hidden interiors should reuse the 4-plate glyph-sequence puzzle mechanic but with theme-appropriate glyphs/visuals (stone+torches vs crystals+bioluminescent mushrooms vs whatever fits the world).
- Reward for completing an interior puzzle: +50 score + a themed flavour message ("ancient credits" / "pearls from the deep" / etc.). Keep rewards small and flavourful rather than mechanically essential.

**Why:** User said verbatim *"this game is more about the adventure and exploring and the feeling then finishing the game. make everything explory and super fun"* and *"like in the pyrmidlevel you can walk into hidden buildings to get to hidden caves. these things should exist in different form on different worlds."*
**How to apply:** When adding new planet content, always ask "where is the hidden interior here?" and design one. When adding player gear, prefer auto-equip on context rather than purchase/select. Favour visual-polish and atmosphere spending over mission-chain complexity.
