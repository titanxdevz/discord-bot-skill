# Discord Bot Engineering Skill

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Skills CLI](https://img.shields.io/badge/Skills-skills.sh-blue.svg)](https://skills.sh)

A comprehensive, framework-agnostic engineering skill for AI coding agents and human developers building, auditing, and operating production-grade Discord bots and applications in **any language** (discord.js, discord.py, discordeno, serenity/poise, JDA, Discord.Net, interactions.py, and hikari).

The skill follows the [Agent Skills](https://skills.sh) open standard and uses **progressive disclosure**: a lean router (`SKILL.md`) directs the agent to specialized reference documents only when needed, keeping context windows clean and preventing API hallucination.

---

## Features & Supported Areas

- **Interaction Lifecycle**: Strict 3-second acknowledgement window, deferral patterns, and single-response guarantees to eliminate `10062 Unknown Interaction` and `40060 Already Acknowledged`.
- **Application Commands**: Slash commands, user context menus, message context menus, subcommand trees, and dynamic autocomplete.
- **Message UI & Components**: Classic message components (buttons, string/user/role/channel/mention selects, action rows), Modals with Label components, and **Components V2** (`Container`, `Section`, `TextDisplay`, `Thumbnail`, `Separator`).
- **Gateway & Events**: Intent-to-event mapping, privileged intent requirements (`GUILD_MEMBERS`, `GUILD_PRESENCES`, `MESSAGE_CONTENT`), partial entity caching, and reconnection idempotency.
- **Voice & Audio (DAVE / E2EE)**: Voice state machines, Opus audio streaming, and mandatory Discord Audio & Video End-to-End Encryption compliance.
- **Data Layer & Caching**: PostgreSQL, SQLite (WAL mode caveats), MongoDB, and Redis caching. Multi-process sharded data safety, idempotent migrations, and transaction invariants.
- **Queues & Rate Limits**: Bucket-aware REST rate-limit handling (`X-RateLimit-*`), jittered exponential backoff, background worker concurrency, and distributed job queues.
- **Reliability & Sharding**: Gateway sharding math (`max_concurrency`, 2,500 guilds ceiling), `ShardingManager`, memory leak prevention (bounded managers & sweepers), structured logging, and graceful shutdown (SIGINT/SIGTERM).
- **Security & Authorization**: Server-side permission bitfields, role hierarchy enforcement, input validation, secret redaction, and Ed25519 webhook signature verification.
- **Automated Audit CLI**: Zero-dependency scanner (`node scripts/audit.mjs`) that inspects codebases for lifecycle bugs, hardcoded secrets, unsafe queries, and unhandled errors.

---

## Installation

Install using the universal [`skills`](https://github.com/vercel-labs/skills) CLI:

```bash
# Install into the current project (auto-detects installed agents)
npx -y skills@latest add titanxdevz/discord-bot-skill

# Install globally for all projects
npx -y skills@latest add titanxdevz/discord-bot-skill -g

# Target a specific AI coding agent
npx -y skills@latest add titanxdevz/discord-bot-skill -a claude-code
npx -y skills@latest add titanxdevz/discord-bot-skill -a cursor
npx -y skills@latest add titanxdevz/discord-bot-skill -a opencode
```

### Manual Installation

Clone or copy this repository into your agent's skills directory:

| Agent | Project Path | Global Path |
|---|---|---|
| **Antigravity** | `.agents/skills/discord-bot/` | `~/.gemini/antigravity/skills/discord-bot/` |
| **Claude Code** | `.claude/skills/discord-bot/` | `~/.claude/skills/discord-bot/` |
| **Cursor** | `.cursor/skills/discord-bot/` | `~/.cursor/skills/discord-bot/` |
| **OpenCode** | `.opencode/skills/discord-bot/` | `~/.config/opencode/skills/discord-bot/` |
| **Universal Agent** | `.agents/skills/discord-bot/` | `~/.agents/skills/discord-bot/` |

---

## Supported AI Coding Agents

Tested and compatible with:
- **Antigravity** (Google DeepMind)
- **Claude Code** (Anthropic)
- **Cursor**
- **OpenCode**
- **Codex & Gemini CLI**
- **Windsurf**

---

## Example Prompts for AI Agents

Once installed, coding agents automatically activate this skill when working on Discord bots. You can also trigger specialized workflows with prompts such as:

```text
"Audit my Discord bot for interaction lifecycle leaks, unhandled rejections, and permission bypasses."
```

```text
"Create a modular support ticket system in discord.js v14 with buttons, modal submission, and PostgreSQL persistence."
```

```text
"Implement a slash command with dynamic autocomplete and ephemeral error boundaries."
```

```text
"Configure cache limits and sweepers on my Discord client to prevent memory leaks in production."
```

```text
"Help me migrate my voice audio bot to comply with Discord's mandatory DAVE E2EE encryption."
```

---

## Repository Structure

```
discord-bot-skill/
├── SKILL.md                          # Main agent skill router & workflow rules
├── README.md                         # Documentation & installation guide
├── LICENSE                           # MIT License
├── RESEARCH.md                       # Architecture research & ecosystem analysis
├── scripts/
│   ├── audit.mjs                     # Read-only bot static analyzer (Node 18+, 0 deps)
│   └── validate.mjs                  # Skill integrity validator (frontmatter, links, coverage)
├── references/                       # Progressive disclosure documentation
│   ├── 00-detection.md               # Stack, runtime, and convention detection checklist
│   ├── 01-api-model.md               # Gateway vs REST, intents, snowflake IDs, rate limits
│   ├── 02-interactions.md            # Interaction lifecycle, 3s ack rule, commands, modals
│   ├── 03-messages-ui.md             # Embeds, attachments, Components V2, layout constraints
│   ├── 04-architecture.md            # Layered architecture, loaders, middleware, error boundaries
│   ├── 05-data-layer.md              # Schemas, migrations, repositories, sharded data safety
│   ├── 06-queues-jobs.md             # Rate-limit buckets, concurrency, retries, schedulers
│   ├── 07-reliability.md             # Connection lifecycle, memory hygiene, structured logging
│   ├── 08-security.md                # Server-side auth, role hierarchy, validation, secrets
│   ├── 09-quality-testing.md         # Test doubles, lifecycle tests, payload contracts, CI
│   ├── 10-deployment.md              # Sharding topology, container health, zero-downtime deploys
│   ├── 11-ux-patterns.md             # Control panels, pagination, confirmations, i18n
│   ├── 12-anti-patterns.md           # Comprehensive symptom → cause → fix catalogue
│   ├── 13-events.md                  # Event-to-intent matrix, dispatch orders, partials
│   ├── 14-voice.md                   # Voice connections, DAVE/E2EE encryption, audio streaming
│   ├── 15-performance.md             # Cache tuning, heap profiling, event loop monitoring
│   └── frameworks/                   # Library-specific adapters
│       ├── discordjs.md              # discord.js v14.x modern architecture
│       ├── discordpy.md              # discord.py v2.x architecture & cogs
│       ├── discordeno.md             # Discordeno zero-cache & microservices
│       ├── serenity-poise.md         # Rust Serenity & Poise framework
│       ├── jda.md                    # Java Discord API (JDA 5)
│       ├── discordnet.md             # Discord.Net C# (.NET 8/9)
│       └── interactions-hikari.md    # Hikari & interactions.py
└── examples/
    └── discordjs/                    # Production-ready TypeScript discord.js v14.28 reference
        ├── package.json              # Configured with discord.js, pg, redis, typescript
        ├── tsconfig.json             # Modern ESM TypeScript configuration
        ├── .env.example              # Environment variables template
        ├── src/
        │   ├── index.ts              # Client bootstrap, bounded caches, graceful shutdown
        │   ├── deploy-commands.ts    # Single-owner REST slash command deploy script
        │   ├── shard.ts              # ShardingManager multi-process coordinator
        │   ├── config.ts             # Fail-fast environment validation
        │   ├── commands/             # Slash commands (/ping, /ticket with subcommands)
        │   ├── events/               # Event handlers (ClientReady, InteractionCreate)
        │   ├── interactions/         # Component router, buttons, modals, customId parser
        │   ├── db/                   # PostgreSQL connection pool & ticket repository
        │   ├── cache/                # Redis rate limiter & key-value cache
        │   └── lib/                  # Structured logger & single-response error handler
        └── test/                     # Automated unit tests using node:test
```

---

## Audit CLI Tool

The repository includes a standalone static analyzer (`scripts/audit.mjs`) designed to inspect Discord bot repositories without installing dependencies:

```bash
# Run a human-readable audit on your project
node scripts/audit.mjs /path/to/bot/repo

# Output machine-readable JSON
node scripts/audit.mjs /path/to/bot/repo --json

# Fail CI if high-severity findings exist
node scripts/audit.mjs /path/to/bot/repo --fail-on high
```

The tool identifies:
- Missing or late interaction acknowledgements (>3s window risk).
- Double-response paths causing `40060 Already Acknowledged`.
- Components V2 payloads conflicting with classic `content` or `embeds`.
- SQLite database usage across multi-process sharding configurations.
- Hardcoded secrets and unignored `.env` files.
- Unbounded in-memory collections and event listeners causing leaks.

---

## Runnable discord.js v14 Reference Example

The `examples/discordjs` directory contains a complete, typechecked, and tested reference bot demonstrating modern production patterns:

```bash
cd examples/discordjs
npm install
npm run build
npm test
```

Features included:
- **TypeScript & ESM**: Strict type checking with modern Node.js module resolution.
- **Interaction Router**: Strict 3-second acknowledgement, button handlers, and modal submissions.
- **Database Integration**: PostgreSQL pool with idempotent migrations and repository patterns.
- **Redis Cache & Cooldowns**: Distributed rate-limiting and session caching.
- **Graceful Shutdown**: Traps `SIGINT`/`SIGTERM` to drain requests, destroy the Discord client, close database pools, and cleanly disconnect.

---

## Validation

Self-validate the skill against Agent Skills formatting rules:

```bash
node scripts/validate.mjs
```

---

## Contributing

Contributions are welcome! Please follow these guidelines:
1. Ensure all code examples are strictly verified against official library documentation.
2. Maintain progressive disclosure: keep `SKILL.md` concise and place deep explanations into `references/`.
3. Run `node scripts/validate.mjs` before submitting pull requests.

---

## License

This project is licensed under the [MIT License](LICENSE).
