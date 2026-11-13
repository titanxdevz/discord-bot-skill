---
name: discord-bot
description: Framework-agnostic engineering guide for Discord bots and integrations. Use when building, reviewing, debugging, migrating, or deploying a Discord bot in any language. Covers slash/context commands, interactions, components, embeds, Components V2, handlers, permissions, database, queues, rate limits, sharding, dashboards/REST, testing, and operations. Triggers on: discord bot, discord.js, discord.py, discordeno, serenity, poise, JDA, Discord.Net, interactions.py, hikari, slash command, interaction failed, unknown interaction, 10062, gateway intents, custom_id, embed, components v2, sharding, rate limit, deferred reply, modal, collector, ticket system, giveaway timer, bot dashboard, bot deployment.
---

# Discord Bot Engineering

Platform-level guidance that works with **any** Discord library and language. It is not a
tutorial and not tied to one framework. The project in front of you is the authority; this
skill tells you what to check, what breaks, and how to structure the work.

## Hard rules (apply to every task)

1. **Read the project before writing code.** Detect language, library, version, handler style,
   DB, and conventions. Never impose Node or Python defaults on a repo that uses something else.
2. **Installed version wins.** If this skill and the installed package/docs disagree, trust the
   installed package (read its types/source) and the live Discord docs.
3. **Acknowledge interactions within 3 seconds.** Defer when work is slow; after deferring you
   have 15 minutes to edit the original response. Missing the window causes `10062 Unknown Interaction`.
4. **Never hardcode Discord rate limits.** Parse `X-RateLimit-*` headers, honor `Retry-After`
   and global limits, and use exponential backoff with jitter.
5. **Check permissions server-side.** Every mutating path re-checks user and bot permissions plus
   role hierarchy. UI hiding is not authorization.
6. **One source of truth for state.** Persist ownership/config in the database, not in process
   Maps. Multi-process sharding makes in-memory state lie.
7. **Every failure path gets a specific, actionable message.** No "something went wrong" and no
   silent catch.
8. **No secrets in code, logs, or error messages.** Validate env at boot and fail fast.
9. **Verify before claiming done.** Run the project's formatter/linter/type-check/tests, or state
   exactly what could not be run.
10. **Prefer the smallest correct change** in existing codebases; match existing patterns before
    introducing new abstractions.

## Step 0 — Detect the stack (always first)

Run the detection checklist in `references/00-detection.md`. Produce a short report:

- language/runtime + package manager
- Discord library + **installed version** (lockfile, not manifest range)
- handler/loader style, command registration path, custom-id scheme
- DB/cache/queue, deployment target, env loading, test runner
- existing conventions to preserve

If anything cannot be detected, say so and proceed with the most conservative assumption.

## Route by task

| Task | Read |
|---|---|
| New bot, architecture, project layout | `04-architecture`, `10-deployment` |
| Slash/context commands, autocomplete | `02-interactions`, adapter file |
| Buttons, selects, modals, routing, collectors | `02-interactions`, `11-ux-patterns` |
| Embeds, formatting, Components V2, panels | `03-messages-ui`, `11-ux-patterns` |
| Interaction fails / times out / double reply | `02-interactions`, `12-anti-patterns` |
| Rate limits, throttling, bulk operations | `01-api-model`, `06-queues-jobs` |
| Database schema, migrations, caching | `05-data-layer` |
| Timers, giveaways, scheduled jobs, workers | `06-queues-jobs` |
| Sharding, clusters, scaling, memory | `07-reliability`, `10-deployment` |
| Permissions, hierarchy, anti-nuke, OAuth | `08-security` |
| Tests, lint, typing, CI | `09-quality-testing` |
| Dashboard/REST/WebSocket | `01-api-model`, `08-security` |
| Tickets, applications, multi-step flows | `04-architecture`, `11-ux-patterns` |
| Unknown / broad request | `00-detection`, then route again |

Framework adapters (load only when the project uses that library):

`frameworks/discordjs.md`, `frameworks/discordpy.md`, `frameworks/discordeno.md`,
`frameworks/serenity-poise.md`, `frameworks/jda.md`, `frameworks/discordnet.md`,
`frameworks/interactions-hikari.md`

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
node scripts/audit.mjs <path>              # human report
node scripts/audit.mjs <path> --json       # machine-readable
node scripts/audit.mjs <path> --all        # every finding (default caps 15 per severity)
node scripts/audit.mjs <path> --fail-on high   # exit 1 on high findings (CI)
```

It detects the stack (language, library + installed version from lockfiles, data stores, sharding,
deploy files, tests), then flags candidates: missing/late acks, double responses, empty catches,
hardcoded secrets, `.env` not ignored, CV2-with-content payloads, SQL string building, unbounded
concurrency/timers, unawaited responses, and SQLite next to sharding. It never edits files and
never touches the network.

Treat output as a review list, not proof: each finding is a regex-level heuristic. Confirm by
reading the code path, then fix the cause. Use `--json` when you want to group findings by rule or
file instead of reading the text report.

## Definition of done

| Area | Required |
|---|---|
| Interaction | Acked ≤3s; deferred for slow work; exactly one response path; no `10062` |
| Permissions | User + bot perms and hierarchy checked; message names the missing permission/channel |
| Data | Additive/idempotent migration; index for the query; transaction for invariants |
| Queue | Bounded concurrency; retries/backoff; idempotent; no unbounded memory growth |
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
- `references/02-interactions.md` — lifecycle, commands, components, routing
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
- `scripts/audit.mjs` — read-only repository audit (Node 18+, no dependencies)

When a task spans several areas, load only the references it needs. Do not read the whole skill
for a one-line fix.
