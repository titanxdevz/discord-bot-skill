# Discord Bot Skill

A framework-agnostic engineering skill for building, auditing, and operating Discord bots in **any
language** — not tied to discord.js, discord.py, or any single stack.

It is written as an agent skill (`SKILL.md`), but the references work as a standalone handbook for
humans too.

## What's inside

| Path | Purpose |
|---|---|
| `SKILL.md` | Router, hard rules, stack detection, build/audit tracks, definition of done |
| `references/00-detection.md` | Detect language, library, version, handler style, DB, deployment |
| `references/01-api-model.md` | Gateway vs REST, intents, IDs, limits, auth |
| `references/02-interactions.md` | 3s ack lifecycle, commands, components, routing, modals |
| `references/03-messages-ui.md` | Embeds, classic components, Components V2 and its limits |
| `references/04-architecture.md` | Loaders, middleware, config, error boundaries |
| `references/05-data-layer.md` | Schema, migrations, repositories, caching, sharding data |
| `references/06-queues-jobs.md` | Rate buckets, concurrency, retries, schedulers |
| `references/07-reliability.md` | Shard lifecycle, memory, logging, metrics |
| `references/08-security.md` | Permissions, hierarchy, validation, OAuth, anti-abuse |
| `references/09-quality-testing.md` | Gates, unit/integration/contract tests, CI |
| `references/10-deployment.md` | Sharding, containers, command registration, backups |
| `references/11-ux-patterns.md` | Panels, pagination, confirmations, i18n, failure UX |
| `references/12-anti-patterns.md` | Symptom → cause → fix catalogue |
| `references/frameworks/` | discord.js, discord.py, discordeno, serenity/poise, JDA, Discord.Net, interactions.py + hikari |
| `scripts/audit.mjs` | Read-only repo audit, Node 18+, zero dependencies |

## Audit CLI

```bash
node scripts/audit.mjs <path>
node scripts/audit.mjs <path> --json
node scripts/audit.mjs <path> --all
node scripts/audit.mjs <path> --fail-on high
```

It detects the stack (library + installed version from lockfiles, data stores, sharding, deploy
files), then flags candidate problems: missing or late acknowledgements, double responses, empty
catches, hardcoded secrets, `.env` not ignored, Components V2 payloads that also send `content`,
SQL string building, unbounded concurrency/timers, unawaited responses, and SQLite next to
sharding.

Findings are heuristics for review — confirm each by reading the code path. The script never edits
files and never touches the network.

## Using it as an agent skill

Drop the folder into your agent's skills directory (for OpenCode: `.opencode/skills/discord-bot-skill/`)
or point the agent at `SKILL.md`. The frontmatter `name`/`description` drives activation.

## Design rules

- The project in front of you is the authority; installed library version wins over this text.
- Prefer the smallest correct change in existing codebases.
- Verify with the project's formatter/linter/types/tests, or say exactly what could not be run.

## License

No license is declared yet. Add one before redistributing.
