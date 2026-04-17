# Project Memory

Use the project-local `memory/` folder (not the global auto-memory) for all persistent memory in this repo.

- Index: `memory/MEMORY.md` — always read this first for context.
- Individual memory files live next to it (one topic per file, frontmatter with `name`, `description`, `type`).
- When saving a new memory: write the file into `memory/` and add a one-line pointer to `memory/MEMORY.md`.
- When updating or removing memory: edit the file and keep `MEMORY.md` in sync.

Memory types: `user`, `feedback`, `project`, `reference` (same semantics as the default auto-memory system).

Do not write memory entries to `~/.claude/projects/.../memory/` for this project — the project folder is the single source of truth and is version-controlled with the code.
