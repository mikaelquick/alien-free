---
name: KISS review before every commit
description: Before committing, always run the kiss-code-reviewer subagent on changed code first
type: feedback
---

Before every commit, run the `kiss-code-reviewer` subagent to review the changed code.

**Why:** User explicitly requested this as a mandatory workflow step — code quality gate before any commit.
**How to apply:** When the user says "commit" or when a commit is about to happen, first launch the kiss-code-reviewer agent on all changed/new code. Only proceed with the commit after the review passes and any flagged issues are addressed.
