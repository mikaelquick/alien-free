---
name: User commits themselves
description: Do not run git commit — the user prefers to commit manually after reviewing
type: feedback
---

The user commits changes themselves. Don't run `git commit` or `git add` unless explicitly asked.

**Why:** User stated "I commited myself continue" after interrupting a commit attempt — they prefer to control the commit step personally even after approving the code changes.
**How to apply:** When the user says "looks good" or approves changes, present the work and stop. Do not proactively stage or commit. The `kiss-code-reviewer` step still applies before declaring work done, but the commit itself is the user's action. If unsure, ask.
