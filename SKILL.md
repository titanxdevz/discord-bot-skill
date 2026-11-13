---
name: discord-bot
description: >-
  Engineering guidance for Discord bots and applications in any language or library (discord.js,
  discord.py, discordeno, serenity/poise, JDA, Discord.Net, interactions.py + hikari, discordgo).
  Use when building, reviewing, debugging, migrating, or deploying a Discord bot: slash and context
  commands, interactions, components and modals, Components V2, embeds, gateway intents and events,
  voice and audio (DAVE/E2EE), permissions and security, databases and caching, queues and timers,
  rate limits and sharding, dashboards and REST, testing, observability, and production deployment.
  Triggers on discord bot, interaction failed, unknown interaction, 10062, 40060, gateway intents,
  custom_id, deferred reply, components v2, sharding, rate limit, ticket system, giveaway, music bot,
  bot dashboard, bot deployment.
license: MIT
compatibility: >-
  Plain Markdown references work in any agent. scripts/audit.mjs and scripts/validate.mjs need
  Node.js 18+ and have no npm dependencies. examples/discordjs needs Node.js 20+ to install and
  typecheck; nothing in the skill requires network access at runtime.
metadata:
  author: titanxdevz
  version: "1.1.0"
  repository: https://github.com/titanxdevz/discord-bot-skill
---

# Discord Bot Engineering

Platform-level guidance that works with **any** Discord library and language. It is not a tutorial
and not tied to one framework. The project in front of you is the authority; this skill tells you
what to check, what breaks, and how to structure the work.

## Scope

**In scope:** bot architecture, interactions, message UI, gateway/events, voice, data, queues,
security, testing, deployment, and incident response for Discord applications.

**Out of scope (say so instead of guessing):** Discord's private/undocumented endpoints, bypassing
rate limits or verification, account automation ("self-bots", user-token clients), and audio
licensing or content acquisition for music bots.

## Hard rules (apply to every task)

1. **Read the project before writing code.** Detect language, library, version, handler style,
   DB, and conventions. Never impose Node or Python defaults on a repo that uses something else.
2. **Installed version wins.** If this skill and the installed package disagree, trust the
   installed package (read its types/source) and the live Discord docs.
3. **Never invent an API.** Confirm every class, method, flag, and option exists in the installed
   version before using it (grep `node_modules/**/*.d.ts`, site-packages, crate docs, or the JAR).
   If it cannot be verified, say what is unverified instead of emitting plausible code.
4. **Acknowledge interactions within 3 seconds.** Defer when work is slow; after deferring you
   have 15 minutes to edit the original response. Missing the window causes `10062 Unknown Interaction`.
5. **Never hardcode Discord rate limits.** Parse `X-RateLimit-*` headers, honor `Retry-After`
   and global limits, and use exponential backoff with jitter.
6. **Check permissions server-side.** Every mutating path re-checks user and bot permissions plus
   role hierarchy. UI hiding is not authorization.
7. **One source of truth for state.** Persist ownership/config in the database, not in process
   Maps. Multi-process sharding makes in-memory state lie.
8. **Every failure path gets a specific, actionable message.** No "something went wrong" and no
   silent catch.
9. **No secrets in code, logs, or error messages.** Validate env at boot and fail fast.
10. **Verify before claiming done.** Run the project's formatter/linter/type-check/tests, or state
    exactly what could not be run.
11. **Prefer the smallest correct change** in existing codebases; match existing patterns before
    introducing new abstractions.

## Step 0 — Detect the stack (always first)

Run the detection checklist in `references/00-detection.md`. Produce a short report:

- language/runtime + package manager
- Discord library + **installed version** (lockfile, not manifest range)
- handler/loader style, command registration path, custom-id scheme
- DB/cache/queue, deployment target, env loading, test runner
- existing conventions to preserve

If anything cannot be detected, say so and proceed with the most conservative assumption.

## Workflow

1. **Detect** (above), then state a one-paragraph plan.
2. **Route** with the table below; open only the references the task needs.
3. **Implement** in the project's existing style; one concern per change.
4. **Prove** it: tests, typecheck/lint, or a precise manual verification step.
5. **Report** what changed, what was verified, and what remains unverified.

For a new bot use Track A; for an existing repo use Track B.

## Route by task

| Task | Read |
|---|---|
| New bot, architecture, project layout | `04-architecture`, `10-deployment` |
| Slash/context commands, autocomplete | `02-interactions`, adapter file |
| Buttons, selects, modals, routing, collectors | `02-interactions`, `03-messages-ui`, `11-ux-patterns` |
| Embeds, formatting, Components V2, panels | `03-messages-ui`, `11-ux-patterns` |
| Interaction fails / times out / double reply | `02-interactions`, `12-anti-patterns` |
| Gateway intents, events, partials, shard routing | `13-events`, `01-api-model` |
| Voice, music, audio playback or receive, DAVE/E2EE | `14-voice`, adapter file |
| Rate limits, throttling, bulk operations | `01-api-model`, `06-queues-jobs` |
| Database schema, migrations, caching, Postgres/Redis | `05-data-layer` |
| Timers, giveaways, scheduled jobs, workers | `06-queues-jobs` |
| Sharding, clusters, scaling, memory | `07-reliability`, `10-deployment` |
| Performance, cache tuning, profiling | `15-performance`, `07-reliability` |
| Permissions, hierarchy, anti-nuke, OAuth | `08-security` |
| Tests, lint, typing, CI | `09-quality-testing` |
| Dashboard/REST/WebSocket | `01-api-model`, `08-security` |
| Tickets, applications, multi-step flows | `04-architecture`, `11-ux-patterns` |
| Unknown / broad request | `00-detection`, then route again |

Framework adapters (load only when the project uses that library):

`references/frameworks/discordjs.md`, `discordpy.md`, `discordeno.md`, `serenity-poise.md`,
`jda.md`, `discordnet.md`, `interactions-hikari.md`

Runnable discord.js v14.28 reference project: `examples/discordjs/` (commands, router, modals,
Components V2, Postgres, Redis, sharding, shutdown, tests).

## Track A — Scaffold a new bot

1. **Requirements**: commands, UI style (embed vs Components V2), persistence, scale, hosting.
2. **Decide the stack** with the user; do not silently choose. Confirm library + DB + deployment.
3. **Skeleton**: config validation, client bootstrap, loader, error boundary, logging.
4. **One vertical slice**: a command → action → DB write → response, wired end to end.
5. **Add the second slice** that exercises the riskiest area (components or queue), proving the
   architecture before bulk work.
6. **Quality gates**: formatter, linter, types, tests, CI, `.env.example`.
7. **Ops**: graceful shutdown, health endpoint if a dashboard exists, deploy instructions.

Deliver runnable files, not fragments, unless the user asks for a snippet.

## Track B — Audit or repair an existing bot

1. **Inventory** (read-only): entry point, handlers, command count, DB access, queue/timers,
   sharding, config, tests, deploy files.
2. **Risk list**, ordered by impact: interaction lifecycle, permission gaps, unbounded state,
   rate-limit violations, schema/migration risks, secret exposure, missing tests.
3. **Fix in slices**: one concern per change; keep public behaviour stable unless asked.
4. **Regression proof**: test or a precise manual verification step per fix.
5. **Report**: what changed, why, what remains, commands run.

Never delete or rewrite unfamiliar code without tracing its callers and data.

## Audit script (read-only)

```bash
node scripts/audit.mjs <path>                  # human report
node scripts/audit.mjs <path> --json           # machine-readable
node scripts/audit.mjs <path> --all            # every finding (default caps per severity)
node scripts/audit.mjs <path> --fail-on high   # exit 1 on high findings (CI)
```

It detects the stack (language, library + installed version from lockfiles, data stores, sharding,
deploy files, tests), then flags candidates: missing/late acks, double responses, empty catches,
hardcoded secrets, `.env` not ignored, CV2-with-content payloads, SQL string building, unbounded
concurrency/timers, unawaited responses, SQLite next to sharding, and voice code missing DAVE
support. It never edits files and never touches the network.

Treat output as a review list, not proof: each finding is a regex-level heuristic. Confirm by
reading the code path, then fix the cause. Use `--json` when you want to group findings by rule or
file instead of reading the text report.

`node scripts/validate.mjs` checks this skill itself (frontmatter, name/directory match, internal
links, reference index) — run it after editing the skill, not in a target project.

## Definition of done

| Area | Required |
|---|---|
| Interaction | Acked ≤3s; deferred for slow work; exactly one response path; no `10062` |
| Permissions | User + bot perms and hierarchy checked; message names the missing permission/channel |
| Data | Additive/idempotent migration; index for the query; transaction for invariants |
| Queue | Bounded concurrency; retries/backoff; idempotent; no unbounded memory growth |
| Voice | DAVE/E2EE path intact; connection state machine handled; no orphan players |
| Security | Input validated; no secret leakage; OAuth state verified; least privilege |
| Quality | Formatter/linter/types/tests pass (or explicitly reported as unavailable) |
| Ops | Logs/metrics for new paths; graceful shutdown unaffected; deploy notes updated |

## Truth hierarchy

1. Project source and installed package declarations
2. Official Discord docs (`discord/discord-api-docs`, linked per reference)
3. This skill
4. Blog posts / tutorials / third-party snippets (never authoritative)

## Reference index

- `references/00-detection.md` — stack/convention detection
- `references/01-api-model.md` — gateway vs REST, intents, IDs, limits, auth
- `references/02-interactions.md` — lifecycle, commands, components, routing, modals
- `references/03-messages-ui.md` — embeds, classic components, Components V2
- `references/04-architecture.md` — loaders, middleware, config, errors
- `references/05-data-layer.md` — schema, migrations, repos, cache, sharding data
- `references/06-queues-jobs.md` — rate buckets, concurrency, retries, schedulers
- `references/07-reliability.md` — shard lifecycle, memory, logs, metrics
- `references/08-security.md` — permissions, hierarchy, validation, anti-abuse
- `references/09-quality-testing.md` — gates, unit/integration/contract tests
- `references/10-deployment.md` — sharding, containers, registration, backups
- `references/11-ux-patterns.md` — panels, pagination, confirmations, i18n
- `references/12-anti-patterns.md` — failure catalogue and fixes
- `references/13-events.md` — event → intent → partial map, dispatch order, shard routing
- `references/14-voice.md` — voice connections, DAVE/E2EE, audio player, receive, music bots
- `references/15-performance.md` — cache tuning, heap/event-loop profiling, budgets
- `references/frameworks/` — per-library adapters (names above)
- `scripts/audit.mjs` — read-only repository audit (Node 18+, no dependencies)
- `scripts/validate.mjs` — self-check for this skill (frontmatter, links, index)

When a task spans several areas, load only the references it needs. Do not read the whole skill
for a one-line fix.
