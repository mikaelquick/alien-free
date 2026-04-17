---
name: Features the user removed
description: Features explicitly removed/rejected by the user — do not re-add without asking
type: feedback
---

The user has removed these features from the game. Do not silently re-enable or re-add them.

1. **Speech bubbles** — removed 2026-04-16. An external "Obeli" ghost companion now handles any in-game commentary. The `speechBubbles.push(...)` calls still exist throughout the code but the render pass at the on-screen draw step is a no-op. Do not restore speech-bubble rendering.
2. **Caves (underwater + dry tunnels)** — disabled 2026-04-16 (user: "the caves are really bad, we can remove them for now"). `generateUnderwaterObjects()` early-returns before the cave section, leaving `underwaterCaves = []`. All cave-dependent logic (isInsideCave, cave rendering, cave creatures) is naturally dormant. The cave code still exists behind the early return — if the user wants caves back later, the fix would be to remove the early-return, but the *implementation quality* is what they disliked, so a redesign may be needed.

**Why:** Both features shipped and the user tried them; both failed the vibe test.
**How to apply:** If a future request touches these areas, confirm before re-enabling. If the user asks "why don't I see X?" and X is speech bubbles or caves — remind them of the deliberate removal rather than treating it as a bug.
