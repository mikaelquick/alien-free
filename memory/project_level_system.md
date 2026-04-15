---
name: Level system design decisions
description: Core design decisions for the level/progression system — linear unlock, roguelike upgrades
type: project
---

Level system design decisions (2026-04-14):

- Planet unlocking is **strictly linear**: Earth → Mars → Glimora → Frostheim → Infernia
- Upgrades use **roguelike reset** — lost on restart/new game, not permanent
- Casual vs Hardcore and New Game+ are deferred decisions

**Why:** User confirmed these during game-level-designer brainstorm session.
**How to apply:** All progression code must enforce linear unlock order. Upgrade state must reset cleanly. Don't build permanent upgrade persistence.
