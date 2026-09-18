# Shared Agent Assets

This directory is the canonical source for project-local agent assets.

- `rules/`: shared rules that should be visible to coding agents.
- `skills/`: reusable agent skills maintained by this project.
- `commands/`: shared command entries for tools that support command files.
- `entrypoints/`: source content used to render official agent entrypoint files such as `AGENTS.md` and `CLAUDE.md`.

After changing files in this directory, run:

```bash
pnpm sync:agent-assets
```

If this project does not use a package manager, run:

```bash
node scripts/sync-agent-assets.mjs
```
