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

## Install as an agent skill

The skill follows the standard agent-skill layout, so it installs with the
[`skills`](https://github.com/vercel-labs/skills) CLI (`npx skills`) — the same flow used by
[skills.sh](https://skills.sh) skills. Requires Node 22.20+.

```bash
# install into the current project (auto-detects installed agents)
npx skills add titanxdevz/discord-bot-skill

# target a specific agent
npx skills add titanxdevz/discord-bot-skill -a opencode
npx skills add titanxdevz/discord-bot-skill -a claude-code

# install globally instead of per-project
npx skills add titanxdevz/discord-bot-skill -g

# preview without installing
npx skills add titanxdevz/discord-bot-skill --list

# pin a revision
npx skills add titanxdevz/discord-bot-skill@v1.0.0
```

Installable skill name: **`discord-bot`** (used with `--skill discord-bot` when a repo holds
several skills).

No CLI? Copy this folder into a skills directory by hand:

| Agent | Project path | Global path |
|---|---|---|
| OpenCode | `.opencode/skills/discord-bot/` | `~/.config/opencode/skills/discord-bot/` |
| Claude Code | `.claude/skills/discord-bot/` | `~/.claude/skills/discord-bot/` |
| Universal | `.agents/skills/discord-bot/` | `~/.agents/skills/discord-bot/` |

The frontmatter `name`/`description` in `SKILL.md` drives discovery and activation; keep
`references/` and `scripts/` beside it so the router's links resolve.

To update later: `npx skills update discord-bot`. To remove: `npx skills remove discord-bot`.

## Design rules

- The project in front of you is the authority; installed library version wins over this text.
- Prefer the smallest correct change in existing codebases.
- Verify with the project's formatter/linter/types/tests, or say exactly what could not be run.

## License

No license is declared yet. Add one before redistributing.
