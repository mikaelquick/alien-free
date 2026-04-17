---
name: Pending Feature Requests
description: Outstanding requests from user not yet implemented as of 2026-04-16
type: project
---

**Deferred — Vite + yarn refactor of monolithic index.html**
User explicitly deferred on 2026-04-16 ("save to memory, we can do the refactor later"). Agreed architecture: Vite + vanilla JS, modules under `src/config`, `src/entities`, `src/systems`, `src/rendering`, `src/menus`, `src/utils`. After refactor the user should be able to run `yarn dev`.

**Why:** index.html is ~8200 lines and a single file; user wants modular architecture but prioritized gameplay polish first.
**How to apply:** Propose this when the user says they're ready to do architecture work, or when adding a substantial new system that would benefit from isolation.

**Other pending polish:**
1. On-foot building interaction refinement — side collision near doorways could be smoother.
2. More human interaction variety — offices, restaurants, shopping (currently: commuting, farming, jogging, praying, phone calls, kids, chatting).
3. Zoo cell overview uses simplified creature drawings; walk mode uses detailed models.
4. User still needs to manually save any pasted logo image as `logo.png` in the project root — code expects that filename. (As of 2026-04-16 logo.png is in place.)
