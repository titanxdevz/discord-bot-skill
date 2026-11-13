# 10 — Deployment & Scaling

Primary sources:
- https://discord.com/developers/docs/events/gateway (sharding, session start limits)
- https://discord.com/developers/docs/topics/rate-limits
- https://discord.com/developers/docs/interactions/application-commands

## 1. Sharding facts (verified from Discord docs)

- One shard supports **at most 2,500 guilds**; apps in 2,500+ guilds **must** shard.
- Ask `GET /gateway/bot` for the recommended `shards` count and `max_concurrency`; do not hardcode.
- Routing: `shard_id = (guild_id >> 22) % num_shards`. Events without `guild_id` (DMs, some
  entitlement/subscription events) go to **shard 0** only.
- Identify is limited: `max_concurrency` identifies per 5 seconds, and **1,000 IDENTIFY calls per
  24 hours** across all shards. Exceeding the 24h limit terminates sessions and **resets the bot
  token**. Use RESUME, never restart loops that re-identify.
- A restart storm is an outage: deploy with rollout, not by killing all shards at once.

## 2. When to scale what

| Symptom | First fix | Then |
|---|---|---|
| REST 429s, high latency | Fix bucketing, batch requests, reduce polling | Shard/scale workers |
| Slow interactions | Defer earlier, move work to jobs | Separate worker process |
| High memory | Bound caches, drop collectors | Split into clusters |
| 2,500+ guilds | Enable sharding | Shard manager / cluster manager |
| CPU-bound (images, crypto) | Move to a worker queue | Separate service/host |
| Dashboard traffic | Separate web service | Shared DB, not shared memory |

Add sharding only when guild count or event volume demands it. Sharding a 200-guild bot adds
failure modes without benefit.

## 3. Process topology

```text
            ┌─────────────┐
            │  dashboard  │  (HTTP, OAuth2, REST proxy)
            └──────┬──────┘
                   │
   ┌───────────────┴───────────────┐
   │            redis / DB          │
   └───────────────┬───────────────┘
                   │
   ┌───────────────┴───────────────┐
   │ shard/cluster manager (1/host) │
   └───────┬───────────────┬───────┘
     shard 0–4          shard 5–9
                   │
            ┌──────┴──────┐
            │  job worker │  (queues, scheduled work)
            └─────────────┘
```

Rules:

- **One** process registers commands (env flag or leader lock). Duplicate registration causes
  rate-limit pain and inconsistent global/guild state.
- **One** owner for schedulers/timers, or a distributed lock per job type.
- Workers must be stateless; all cross-process state goes through DB/Redis.
- Never let two processes own the same SQLite file. See `05-data-layer`.

## 4. Configuration & environments

- `dev` → `staging` → `prod` applications and tokens are separate. Never test on prod.
- Validate config at boot; crash fast on missing/invalid values.
- `.env.example` committed, `.env` ignored. Secrets from the platform's secret store.
- Put the git commit and build time into logs and health output.
- Per-guild settings in DB; global tunables in env.

## 5. Command registration

- Development: guild-scoped for instant updates. Production: global, or per-guild if the bot is
  intentionally sharded by region.
- Register **only when the payload changed** (hash stored in DB/env) or via an explicit deploy
  step. Do not register on every shard boot.
- Clear stale guild commands when moving to global; otherwise users see duplicates.
- Registration failures are deploy failures: log the payload and the API error.

## 6. Containers & hosts

- Health check: `/health/live` (process) and `/health/ready` (gateway connected, DB reachable,
  migrations applied).
- Graceful shutdown on SIGTERM: stop intake → drain with deadline → persist → close DB → exit.
  Set the platform's grace period above your drain deadline.
- Restart policy: always/on-failure with backoff. A crash loop must alert, not silently churn.
- Pin the runtime image; avoid `latest`.
- Persist data outside the container (volume/managed DB); containers are disposable.
- Set memory limits slightly above measured peak; watch RSS after deploys.

## 7. Migrations at deploy time

Order that avoids downtime:

```text
1. backup / snapshot
2. apply additive migration (backward compatible)
3. deploy new code (reads new + old)
4. backfill in a job
5. later release: remove old columns/reads
```

- Never run destructive migrations in the same release as the code that stops using the data.
- Migrations run once from a single process, guarded by a lock/advisory lock.
- If a migration fails, abort the deploy; do not start the bot on a half-migrated schema.

## 8. Rollout & rollback

- Deploy one shard/instance at a time; verify `ready` before continuing.
- Keep the previous artifact deployable; rollback must not require a DB rollback.
- Feature-flag risky features so they can be disabled without a deploy.
- After rollout, check: error rate, ack latency, `10062` count, queue depth, shard reconnects.
- Keep a short runbook: how to restart a shard, rotate a token, restore a backup, disable a feature.

## 9. Backups & data safety

- Automated DB backups with a tested restore; record the last successful restore date.
- SQLite: use the backup API/`.backup`, not a copy of a live WAL file.
- Redis: decide explicitly whether it is cache (safe to lose) or queue (must be durable).
- Test the "new host, empty volume, restore" path at least once.

## 10. Cost & footprint sanity

- Don't run one process per shard per guild cluster if the library supports sharding in-process;
  pick the model the library documents.
- Avoid polling Discord when events exist.
- Compress/cache transcripts; don't keep large buffers resident.
- Log retention and metrics cardinality are recurring costs — cap them.

## 11. Go-live checklist

- [ ] Intents enabled in the portal, including privileged ones
- [ ] Commands registered once, verified in a test guild
- [ ] Config validated; secrets in the platform store; `.env` not committed
- [ ] Migrations applied, backup taken, restore path known
- [ ] Health/readiness endpoints wired to the platform checks
- [ ] Graceful shutdown verified with the platform's stop signal
- [ ] Logs/metrics/alerts live for errors, ack latency, queue depth, shard status
- [ ] Sharding decision documented (not sharded / recommended count / concurrency)
- [ ] Rollback artifact available; feature flags off for destructive features
- [ ] Rate limit handling verified under a burst, not just in normal traffic
