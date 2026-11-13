# 04 — Architecture & Handlers

Goal: commands, events, components and background work share one action layer, with errors and
permissions handled in exactly one place.

## 1. Layering

```
transport      command / event / component / REST route / queue worker
  ↓ validates input, resolves context, responds
application    actions/services: one function per operation, returns {ok, message, data}
  ↓ no Discord reply calls inside
domain         pure rules: validators, name formats, permission decisions, state machines
  ↓
infrastructure DB repositories, cache, queue, external APIs
```

Rules:

- One implementation per operation. Prefix, slash, button and dashboard call the same action.
- Actions return a result object; they do not send replies.
- Pure logic stays importable without a Discord client or DB connection (testable).
- Handlers stay thin: parse → authorize → act → respond → log.

## 2. Loader / registry

- Discover modules by directory scan or explicit registry; keep order deterministic (sort paths).
- Fail fast on duplicate command names, missing `execute`, or bad metadata.
- Validate command payloads at load time (name regex, description length, option shapes).
- Keep a map keyed by command name and a secondary map for `name,subcommand` if supported.
- Slash registration is separate from runtime loading; one owner process registers.
- Hot reload is a dev feature; never rely on it in production.

Component registry:

- Namespaced `custom_id` prefixes → handler modules.
- A single `interactionCreate` entry point is easier to audit than many ad-hoc listeners.
- Unknown prefix → log + generic safe reply, never crash.

## 3. Middleware pipeline

Order matters:

```
context → rate limit/cooldown → user permissions → bot permissions → hierarchy
        → guild config/feature flag → validation → execute → error mapper → metrics
```

- Cooldowns: per user + per guild + per command; store in memory with TTL or Redis for clusters.
- Permissions: check both user and bot; check channel overwrites, not only guild roles.
- Hierarchy: role position and channel overwrites for moderation actions.
- Feature flags/guild config: cached, with invalidation on update.
- Validation: parse/validate once; pass typed values down.
- Error mapper: map known failures to user messages; log unknown ones with correlation ID.

Centralizing this avoids the classic bug where one surface (button) skips the permission check
that the slash command performs.

## 4. Configuration

- Validate env at boot with a schema (zod/pydantic/serde/etc.); exit on invalid config.
- Provide `.env.example` with every required key and safe placeholders.
- Separate secrets from tunables; never log secret values.
- Per-guild settings live in the DB, not env; cache them with explicit invalidation.
- Feature flags default to off for destructive features.

## 5. Error boundaries

- Wrap every event handler; one guild's failure must not kill the process.
- Differentiate user errors (safe to show) from internal errors (generic message + log).
- Always include: command/component name, guild ID, user ID, correlation ID.
- After an error: if unacknowledged → ephemeral error; if deferred → edit; else follow-up.
- Never retry an interaction response; retry the underlying operation instead.

## 6. State machines (multi-step flows)

For tickets, applications, setup wizards:

- Explicit states (`open → claimed → closed`) stored in DB.
- Every transition checks current state and actor permission.
- Idempotent transitions: repeating "close" is a no-op with a clear message.
- Store the panel/message IDs so the UI can be edited or deleted later.
- Timeouts/expiry handled by a scheduler, not by sleeping coroutines.

## 7. Concurrency

- Discord events for one guild can arrive concurrently; serialize per-guild mutations when order
  matters (locks, queue, or DB transaction).
- Use atomic DB updates (`UPDATE ... WHERE state = ...`) instead of read-modify-write.
- Avoid `await` inside loops over many members; batch and bound concurrency.
- Never block the event loop with sync I/O, large JSON, or image processing in hot paths.

## 8. File layout (language-neutral)

```
src/
  entry            bootstrap, config, client
  commands/        one file per command or per feature group
  events/          gateway/event listeners
  interactions/    component/modal router
  actions/         one function per operation
  domain/          pure rules and validators
  db/              repositories + migrations
  jobs/            scheduled/queued work
  ui/              panel/embed builders
  lib/             logging, errors, http, cache
```

Adapt names to the repo; consistency beats the exact tree.

## 9. Review checklist

- [ ] One action layer; no duplicated logic across surfaces
- [ ] Loader validates metadata and rejects duplicates
- [ ] Middleware order documented and shared by all surfaces
- [ ] Config validated at boot; secrets not logged
- [ ] Every event wrapped in an error boundary
- [ ] Multi-step flows use explicit, idempotent state transitions
- [ ] Per-guild concurrency controlled where order matters
- [ ] Pure logic separated and testable
