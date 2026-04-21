---
name: Begging pose — no speech bubble
description: Stuck panicking units kneel and plead visually; never attach a speech bubble to the beg
type: feedback
---

Scared units that wedge in place (can't flee) sometimes collapse into a kneeling "beg for mercy" pose (`h.begging`). The intent is purely visual — do NOT attach a speech bubble, scream, or text overlay to this state.

**Why:** user explicitly asked for the pose with no speech bubble when requesting the behavior. Aligns with the broader "speech bubbles removed" preference for panic content.

**How to apply:** when touching panic/beg code in `src/main.js` (the two human update loops and the pose override), keep the beg silent. Tears are already handled by the generic crying code and are fine.
