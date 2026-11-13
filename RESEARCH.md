# Discord Bot Skill — Research & Proposal

Research date: 2026-11-13
Scope: a **framework-agnostic, full-stack Discord bot engineering skill** usable on greenfield
projects and existing codebases, in any language, covering message UI (embeds **and**
Components V2), handlers/architecture, data, queues, security, testing, and deployment.

---

## 1. What the skill must be

| Requirement | Implication |
|---|---|
| Works for **any language/runtime** | Framework-neutral core + per-library adapter references. Never assume Node or Python. |
| Works **from scratch and on existing bots** | Two explicit tracks: `scaffold` and `audit/repair`. Always read the repo before writing code. |
| Covers **message UI** | Embeds, classic components, and Components V2 — with a decision table, not one blessed style. |
| Covers **backend concerns** | Handlers, routing, DB schema/migrations, caching, queues, scheduling, rate limits, observability, deployment. |
| Not tutorial prose | Decision tables, invariants, checklists, failure modes, migration paths. |
| Token-efficient | `SKILL.md` router + `references/*` loaded on demand (progressive disclosure). |
| Stays current | Installed library version and live Discord docs are the authority, not the skill text. |

---

## 2. Landscape: existing Discord agent skills

There are already a few Discord-focused agent skills. None covers the full requested surface.

| Skill | Scope | What to borrow | Gap |
|---|---|---|---|
| [ItsChakal/discord-skill](https://github.com/ItsChakal/discord-skill) | discord.js v14 expert, refs for architecture / interactions / advanced / gotchas | Clean `references/` index, "skip the basics", gotchas-first tone | JS-only; no DB/queue/observability depth |
| [Shnimlz/discord-skill](https://github.com/Shnimlz/discord-skill) | Cross-runtime audit CLI + architecture refs (clean architecture, resilience, voice) | Audit/CLI idea, boundary rules, baseline snapshots | discord.js ecosystem-focused; no multi-language matrix |
| [tiramisulabs/SKILL.md](https://github.com/tiramisulabs/SKILL.md) | Seyfert v5 framework | "Installed declarations are source truth", task routing, version pinning | Single framework |
| [drewdestar/discord-py-skills](https://github.com/drewdestar/discord-py-skills) | discord.py starter kit | Python adapter content | Python-only, starter-focused |
| [creatorsarea/discord-privileged-intents](https://github.com/creatorsarea/discord-privileged-intents) | Privileged intents form/audit | Policy freshness check (`VERSION`), procedural step gating | One narrow topic |

**Differentiation for ours:** platform-level (not library-level), language-agnostic core,
backend/ops included, and dual-track (new + existing). The Discord-specific skills above become
*prior art*, not dependencies.

Skill-format prior art:

- [Agent Skills specification](https://agentskills.io/specification)
- [anthropics/skills](https://github.com/anthropics/skills) — see `skill-creator` (draft → eval →
  iterate), `mcp-builder` (large reference-driven skill), and `template/SKILL.md`
- [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills)
- [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)
- [PatrickJS/awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules)

---

## 3. Verified reference library

### 3.1 Official Discord documentation (primary source of truth)

| Reference | Use for |
|---|---|
| [Discord Developer Docs](https://discord.com/developers/docs/intro) | Root of all API behaviour |
| [Components Overview](https://discord.com/developers/docs/components/overview) | CV2 model, `IS_COMPONENTS_V2` (`1<<15` = 32768) |
| [Components Reference](https://discord.com/developers/docs/components/reference) | Exact limits: 40 components/message, `custom_id` 1–100 chars, button label 80, select options 25 |
| [Using Message Components](https://discord.com/developers/docs/components/using-message-components) | CV2 payloads; webhooks need `?with_components=true`; flag is irreversible |
| [Using Modal Components](https://discord.com/developers/docs/components/using-modal-components) | Modal layout/labels |
| [Interactions Overview](https://discord.com/developers/docs/interactions/overview) | Command/component/modal model |
| [Receiving & Responding](https://discord.com/developers/docs/interactions/receiving-and-responding) | 3-second ack, deferrals, follow-ups, response types |
| [Application Commands](https://discord.com/developers/docs/interactions/application-commands) | Registration, scopes, options, localization |
| [Rate Limits](https://discord.com/developers/docs/topics/rate-limits) | Bucket headers, global limits, 429 handling — never hardcode |
| [Gateway](https://discord.com/developers/docs/topics/gateway) | Intents, identify/resume, sharding |
| [Permissions](https://discord.com/developers/docs/topics/permissions) | Bitfields, hierarchy, overwrites |
| [Message Resource](https://discord.com/developers/docs/resources/message) | Embed limits and message fields |
| [Webhook Resource](https://discord.com/developers/docs/resources/webhook) | Webhook execution, tokens, signature expectations |
| [OAuth2](https://discord.com/developers/docs/topics/oauth2) | Dashboard auth, scopes, state |
| [Auto Moderation](https://discord.com/developers/docs/resources/auto-moderation) | Native AutoMod rules |
| [Audit Log](https://discord.com/developers/docs/resources/audit-log) | Attribution for moderation/security features |
| [discord-api-docs source](https://github.com/discord/discord-api-docs) | Offline diffing of docs; all pages under `developers/` |

### 3.2 Libraries per language (adapter sources)

| Language | Library | Docs / repo |
|---|---|---|
| JS/TS | discord.js | [docs](https://discord.js.org/docs/packages/discord.js/main) · [repo](https://github.com/discordjs/discord.js) · [guide](https://discordjs.guide/) |
| JS/TS | discord-api-types | https://github.com/discordjs/discord-api-types |
| JS/TS | @discordjs/voice | https://github.com/discordjs/voice |
| JS/TS | discordeno (also Deno) | https://discordeno.js.org/ |
| Python | discord.py | https://discordpy.readthedocs.io/en/stable/ |
| Python | interactions.py | https://interactions-py.github.io/interactions.py/ |
| Python | hikari | https://docs.hikari-py.dev/ |
| Python | nextcord | https://github.com/nextcord/nextcord |
| Rust | serenity | https://serenity.rs/ |
| Rust | poise (commands) | https://docs.rs/poise |
| Java/Kotlin | JDA | https://jda.wiki/ |
| C#/.NET | Discord.Net | https://discordnet.dev/ |

### 3.3 Frameworks & architecture patterns

| Reference | What to extract |
|---|---|
| [sapphiredev/framework](https://github.com/sapphiredev/framework) · [docs](https://sapphirejs.dev/) | Stores, preconditions, plugins, argument parsing, modular pieces |
| [neplexlabs/commandkit](https://github.com/neplexlabs/commandkit) · [docs](https://commandkit.dev/) | Middleware pipeline, feature flags, meta-framework layout |
| [meister03/discord-hybrid-sharding](https://github.com/meister03/discord-hybrid-sharding) | ClusterManager, shard math, cross-cluster communication |
| [TFAGaming/DiscordJS-V14-Bot-Template](https://github.com/TFAGaming/DiscordJS-V14-Bot-Template) | Command/component/event handler layout, all command types |
| [NamVr/DiscordBot-Template](https://github.com/NamVr/DiscordBot-Template) | Guide-aligned handler structure |
| [KevinNovak/Discord-Bot-TypeScript-Template](https://github.com/KevinNovak/Discord-Bot-TypeScript-Template) | TS project layout, env validation, deployment patterns |
| [ZarScape/discord.js-v14-v2-template](https://github.com/ZarScape/discord.js-v14-v2-template) | Components V2 template layout |
| [kkrypt0nn/Python-Discord-Bot-Template](https://github.com/kkrypt0nn/Python-Discord-Bot-Template) | Python cog/extension layout |

### 3.4 Message UI, embeds, Components V2

| Reference | What to extract |
|---|---|
| [merlinfuchs/embed-generator](https://github.com/merlinfuchs/embed-generator) · [message.style](https://message.style) | Embed/CV2 JSON shapes, preview workflow, limits in practice |
| [Glitchii/embedbuilder](https://github.com/Glitchii/embedbuilder) | Embed JSON editor, field limits |
| [ramkrishna-js/container-factory](https://github.com/ramkrishna-js/container-factory) | Fluent CV2 builder patterns, section/gallery composition |

### 3.5 Data layer

| Reference | What to extract |
|---|---|
| [WiseLibs/better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Sync SQLite, WAL, transactions, multi-process caveats |
| [prisma/prisma](https://github.com/prisma/prisma) | Schema + migrations workflow |
| [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm) | Typed SQL, migration generation |
| [kysely-org/kysely](https://github.com/kysely-org/kysely) | Type-safe query builder, migration interface |
| [mongodb/node-mongodb-native](https://github.com/mongodb/node-mongodb-native) | Driver-level usage, indexes, sessions |
| [colinhacks/zod](https://github.com/colinhacks/zod) | Config/input validation at boundaries |

### 3.6 Queues, scheduling, reliability, observability

| Reference | What to extract |
|---|---|
| [taskforcesh/bullmq](https://github.com/taskforcesh/bullmq) | Redis queues, retries, backoff, delayed jobs, workers, idempotency |
| [sindresorhus/p-queue](https://github.com/sindresorhus/p-queue) | In-process concurrency limits, per-guild serialization |
| [pinojs/pino](https://github.com/pinojs/pino) | Structured logging, redaction, child loggers |
| [siimon/prom-client](https://github.com/siimon/prom-client) | Metrics: latency, queue depth, error rate |
| [open-telemetry/opentelemetry-js](https://github.com/open-telemetry/opentelemetry-js) | Traces/metrics for cross-service bot + API |

### 3.7 Code quality & testing

| Reference | What to extract |
|---|---|
| [biomejs/biome](https://github.com/biomejs/biome) | Fast lint+format baseline |
| [eslint/eslint](https://github.com/eslint/eslint) · [prettier/prettier](https://github.com/prettier/prettier) | Established JS/TS quality gates |
| [vitest-dev/vitest](https://github.com/vitest-dev/vitest) | Unit/integration test structure |
| Python equivalents for adapters | ruff, black, mypy/pyright, pytest |

### 3.8 Domain examples (tickets, transcripts, dashboards)

| Reference | What to extract |
|---|---|
| [open-discord-bots/open-ticket](https://github.com/open-discord-bots/open-ticket) | Ticket lifecycle, claiming, transcripts, plugins |
| [Sayrix/Ticket-Bot](https://github.com/Sayrix/Ticket-Bot) | Simple ticket UX, transcript generation |
| [mahtoid/DiscordChatExporterPy](https://github.com/mahtoid/DiscordChatExporterPy) | HTML transcript generation, pagination |
| [discord/discord-interactions-js](https://github.com/discord/discord-interactions-js) | Ed25519 interaction verification for HTTP bots |

---

## 4. Proposed skill structure

```
discord-bot-skill/
├── SKILL.md                      # router: non-negotiables, tracks, reference index
├── references/
│   ├── 00-detection.md           # identify language, library, version, conventions
│   ├── 01-api-model.md           # gateway vs REST, intents, IDs, limits, auth
│   ├── 02-interactions.md        # commands, 3s lifecycle, defer, follow-ups, routing
│   ├── 03-messages-ui.md         # embeds vs classic components vs CV2, limits
│   ├── 04-architecture.md        # loaders, middleware, DI, config, error boundaries
│   ├── 05-data-layer.md          # schema, migrations, repos, caching, transactions
│   ├── 06-queues-jobs.md         # rate buckets, concurrency, cron, retries, idempotency
│   ├── 07-reliability.md         # reconnects, timeouts, memory, shutdown, observability
│   ├── 08-security.md            # permissions, hierarchy, anti-abuse, secrets, OAuth
│   ├── 09-quality-testing.md     # lint/type gates, unit/integration, contracts
│   ├── 10-deployment.md          # sharding, Docker, envs, registration, backups
│   ├── 11-ux-patterns.md         # panels, pagination, confirmations, i18n
│   ├── 12-anti-patterns.md       # failure catalogue with fixes
│   └── frameworks/
│       ├── discordjs.md
│       ├── discordpy.md
│       ├── discordeno.md
│       ├── serenity-poise.md
│       ├── jda.md
│       ├── discordnet.md
│       └── interactions-hikari.md
├── scripts/
│   ├── detect-stack.mjs          # heuristic scanner (no network)
│   └── audit.mjs                 # checklist runner over a repo
└── templates/
    └── (optional minimal manifests per language)
```

### `SKILL.md` contract (target ≤ 350 lines)

1. **When to use** — triggers list (bot, slash command, interaction, embed, CV2, sharding, DB,
   queue, dashboard API, deployment).
2. **Rules that never bend** — ack within 3s, parse rate-limit headers, permission checks
   server-side, no secrets in code, read the project before writing, installed version wins.
3. **Step 0: detect** — run `references/00-detection.md`; never assume a stack.
4. **Route by task** — table mapping task → reference file(s) → deliverable.
5. **Two tracks** —
   - `scaffold`: requirements → architecture → minimal vertical slice → tests → deploy.
   - `audit`: inventory → risk list → targeted fixes → regression checks.
6. **Definition of done** — per-task checklist (see §6).
7. **Reference index** — load only what the task needs.

### Progressive disclosure rules

- `SKILL.md` holds routing + invariants only.
- One topic per reference; no duplicated content between files.
- Framework files contain only API differences and idioms; common behaviour stays in core refs.
- Prefer tables and short code shapes over long tutorials.
- Every reference ends with a verification checklist and links to primary docs.

---

## 5. Reference content outline

### 00 — Detection

- Detect: language, runtime, package manager, library + **installed version**, handler style,
  DB, cache, queue, deployment target, env loading, test runner.
- Detect conventions: file naming, command shape, custom-id scheme, error envelope, logging.
- Output: a one-screen stack report; ask only if genuinely ambiguous.
- Rule: the lockfile/installed package and the project's own patterns outrank this skill.

### 01 — API model

- Gateway vs REST vs webhooks vs HTTP-only interactions: when each applies.
- Intents: minimal set, privileged intents, `DisallowedIntents` failure mode.
- Snowflakes: string-safe IDs (JS precision), timestamps, pagination cursors.
- Limits that bite: command/option caps, message/embed/component caps, file sizes.
- Auth: bot token, OAuth2, webhook tokens; secret handling.

### 02 — Interactions

- Lifecycle: receive → 3s ack → defer → edit/follow-up (15 min window) → `10062 Unknown Interaction`.
- Response types: reply, defer, update, modal, autocomplete, premium/entitlement errors.
- Slash/context commands: registration scopes, guild vs global sync, option types.
- Components: button/select/modal routing, `custom_id` namespacing, state encoding, uniqueness.
- Collectors vs centralized router; timeouts; double-click/idempotency.
- Error UX: ephemeral error, recoverable vs fatal, logging correlation ID.

### 03 — Messages UI

- Decision table: plain text vs embed vs classic components vs Components V2.
- Embeds: limits, truncation strategy, safe markdown/mention handling, localization.
- CV2: `IS_COMPONENTS_V2` (32768), content/embeds disabled, flag irreversible, 40 components,
  text display limits, section/thumbnail/media-gallery composition, webhook `?with_components=true`.
- Reusable panel lifecycle: send once, edit in place, delete safely, survive restart.
- Accessibility and mobile width constraints; fallbacks when a component type is unavailable.

### 04 — Architecture & handlers

- Loader patterns: command, event, component, task, migration discovery; deterministic ordering.
- Middleware chain: auth → permissions → cooldown → validation → execute → error mapper.
- Dependency injection/config: typed env schema, fail-fast validation, feature flags.
- Error boundaries per event; never let one guild event kill the shard.
- File/module size and naming rules; pure logic separated from transport code.
- State machines for multi-step flows (tickets, applications, giveaways).

### 05 — Data layer

- Choose: SQLite (single process, WAL), Postgres (multi-process), Mongo (document), Redis (cache).
- **Sharding warning:** SQLite across shard processes shares files; scope reads/writes by shard
  guild ids; never reconcile globally from one shard's cache.
- Schema: per-feature tables, indexes for hot queries, additive migrations (`ALTER` guarded),
  unique constraints for invariants (e.g. one channel per owner).
- Repository pattern; no SQL in command handlers; transactions for multi-row invariants.
- Cache: invalidation, TTL, per-guild config cache, cold-start hydration.
- Retention, deletion requests, backups, restore drills, export/import.

### 06 — Queues, scheduling, rate limits

- Three layers: Discord rate limits (headers/buckets), per-guild serialization, global concurrency.
- In-process (`p-queue`) vs durable (`BullMQ`/Redis): when a job must survive restart.
- Retries: exponential backoff + jitter, max attempts, dead-letter, poison-job handling.
- Idempotency keys; dedupe windows; exactly-once illusions.
- Schedulers: cron drift, missed ticks, catch-up policy, timezone.
- Bulk operations: bulk delete, chunked edits, avoid per-member loops where batch endpoints exist.

### 07 — Reliability & observability

- Shard/cluster lifecycle: ready, resume, reconnect, death, respawn, graceful shutdown.
- Interaction timeouts and unknown-interaction recovery.
- Memory: unbounded Maps/collectors, cache limits, interval cleanup.
- Structured logs (correlation id, guild id, command, duration), redaction.
- Metrics: command latency p95, error rate, queue depth, gateway ping, shard uptime.
- Health endpoint, liveness vs readiness; alert thresholds.

### 08 — Security

- Permission checks on every mutating path (not only in the UI); hierarchy checks for role actions.
- Input validation at boundaries; mention/format injection; SSRF via user-supplied URLs.
- Secrets: env only, rotation, no logging; webhook signature verification.
- OAuth2: state/PKCE, scope minimization, session storage, redirect allowlist.
- Anti-abuse: cooldowns, per-user/per-guild quotas, anti-nuke heuristics, audit-log attribution.
- Least privilege bot permissions; separate dev/prod applications.

### 09 — Quality & testing

- Gates: formatter, linter, types (if available), tests, dependency audit.
- Unit: pure validators/parsers/name formats.
- Integration: mocked REST + gateway; test interaction envelopes and custom-id routing.
- Contract tests: panel payload snapshots, command registration payloads, DB migration idempotency.
- Test DB isolation (temp file/in-memory), never production data.
- Regression tests for every bug fix; failure-path tests for permissions/rate limits.

### 10 — Deployment

- Sharding math (`shards = ceil(guilds / 1000)` guidance, verify current docs), cluster manager,
  stateless workers vs stateful caches.
- Env matrix (dev/staging/prod), config validation at boot, secret injection.
- Docker/K8s/PM2: health checks, restart policy, graceful drain.
- Slash command deployment: global vs guild during development, avoid duplicate registrations.
- Backups, rollback plan, migration ordering, zero-downtime checklist.

### 11 — UX patterns

- Panels: control, interface, setup, help; ownership resolution; stale-record cleanup.
- Pagination, select-driven navigation, confirmation for destructive actions.
- Ephemeral vs public decision table.
- Localization/i18n and per-guild language; timezone-aware timestamps.

### 12 — Anti-patterns

- Global Maps as source of truth; state lost on restart.
- Sending a new panel per event instead of editing.
- Replying after defer without `editReply`; double replies.
- Hardcoded rate limits; sleep-based throttling.
- Per-guild SQL without indexes; N+1 queries in loops.
- Blocking the event loop (sync I/O, big JSON, canvas in hot paths).
- Catching everything and returning "something went wrong".
- Deleting rows based on a single shard's cache.

---

## 6. Definition of done (per task)

| Area | Checklist |
|---|---|
| Interaction | Acked ≤3s; deferred if slow; single response path; no `10062`; error is actionable |
| Permissions | Bot + user perms checked; hierarchy checked; failure names the missing permission/channel |
| Data | Migration additive/idempotent; index for query; transaction for invariants; backup noted |
| Queue | Bounded concurrency; retry/backoff; idempotent; no unbounded in-memory growth |
| Security | No secrets in code/logs; input validated; OAuth state verified; least privilege |
| Quality | Formatter/linter/types/tests pass; regression test for the bug |
| Ops | Logs/metrics added; graceful shutdown unaffected; deploy steps documented |

---

## 7. Skill authoring standards

- Frontmatter: kebab-case `name`, trigger-rich `description` (≤1024 chars), no version claims.
- Keep `SKILL.md` under ~350–500 lines; move detail to `references/`.
- No network-dependent scripts; deterministic output; read-only by default.
- Freshness: a `VERSION`/date line, primary-doc links, and "installed version wins" rule.
- Evals: 8–12 prompts covering scaffold, audit, CV2, embeds, DB migration, queue, sharding,
  permission bug, interaction timeout, deployment.
- License hygiene: extract patterns from MIT/Apache sources; do not copy large text.

---

## 8. Recommended build order

1. **Core router** — `SKILL.md` + `00-detection` + `02-interactions` + `03-messages-ui`.
2. **Backend core** — `04-architecture`, `05-data-layer`, `06-queues-jobs`.
3. **Hardening** — `07-reliability`, `08-security`, `09-quality-testing`, `10-deployment`.
4. **Polish** — `11-ux-patterns`, `12-anti-patterns`, framework adapters.
5. **Tooling** — audit script, templates, eval prompts.

This order gives a usable skill after phase 1 and full coverage by phase 5.

---

## 9. Open questions

1. Should adapters ship for **all** listed languages, or start with discord.js + discord.py and
   add the rest later?
2. Should the skill include runnable **scaffold templates** per language, or stay guidance-only?
3. Do you want the audit CLI (read-only repo scanner) in the first release?
4. Target budget: compact (`SKILL.md` + 6 refs) or complete (full tree above)?
