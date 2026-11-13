# 05 — Data Layer

Primary references:
- https://github.com/WiseLibs/better-sqlite3
- https://github.com/prisma/prisma
- https://github.com/drizzle-team/drizzle-orm
- https://github.com/kysely-org/kysely
- https://github.com/mongodb/node-mongodb-native

## 1. Choose the store

| Store | Good for | Watch out |
|---|---|---|
| SQLite (WAL) | Single-process bots, small/medium guild count | One writer; shared files across shards are dangerous |
| PostgreSQL | Multi-process, dashboards, strong constraints | Connection pooling, migrations, network latency |
| MySQL/MariaDB | Existing infra | Similar to Postgres; weaker JSON/index ergonomics vary |
| MongoDB | Flexible documents, per-guild blobs | Index discipline, no joins, schema drift |
| Redis | Cache, sessions, queues, cooldowns | Not durable by default; define TTLs and eviction |
| Files/JSON | Prototypes only | Corruption, no concurrency, no query |

**Sharding warning (critical):** if multiple shard processes open the same SQLite files, each
process only caches its own guilds. Never reconcile or delete rows globally from one shard's
cache. Scope every query by the guild IDs this shard owns, and never use a local cache as proof
that a row is stale.

## 2. Schema design

- One table per feature; avoid one giant `guilds` table with dozens of nullable columns.
- Primary keys: `(guild_id, id)` for guild-scoped resources; text IDs for snowflakes.
- Timestamps: store UTC (`TEXT` ISO-8601 or integer epoch); render with Discord timestamps.
- Enforce invariants in the DB: `UNIQUE(guild_id, owner_id)` beats a code check.
- Add indexes for every hot `WHERE`/`ORDER BY`; measure before adding more.
- Soft delete only when history matters; otherwise delete and clean up references.
- Store `created_at`, `updated_at` on mutable rows; use DB defaults where possible.
- Keep JSON columns for flexible config, but promote fields you query into columns.

Example:

```sql
CREATE TABLE IF NOT EXISTS vm_channels (
  guild_id   TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  owner_id   TEXT NOT NULL,
  hub_id     TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, channel_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS vm_channels_owner
  ON vm_channels (guild_id, owner_id);
CREATE INDEX IF NOT EXISTS vm_channels_owner_lookup
  ON vm_channels (owner_id);
```

## 3. Migrations

- Additive first: `ADD COLUMN` guarded by a schema check; never drop data in a routine migration.
- Every migration idempotent and repeatable; record applied versions.
- Wrap related changes in a transaction when the engine supports DDL transactions.
- Backfill separately from schema change; make backfills re-runnable and non-destructive.
- Test migrations against a copy of production-like data, not an empty DB only.
- Destructive changes (drop/rename) need a plan: dual-write, backfill, switch reads, then remove.

## 4. Repository pattern

- One repository per table/aggregate: `get`, `list`, `create`, `update`, `delete`, scoped helpers.
- No SQL in command/event handlers; no Discord objects passed into repositories.
- Return plain data objects; map DB rows once.
- Transactions exposed as a repository method, not leaked to handlers.
- Guard against stale rows: a referenced channel/message may no longer exist; delete and report.

## 5. Caching

- Cache per-guild config with TTL + explicit invalidation on write.
- Never cache authorization decisions longer than the underlying state can change.
- Use a two-layer pattern: in-process LRU (fast) + Redis (shared) where needed.
- Cache keys include guild/resource IDs; version the key when the shape changes.
- On cluster broadcast, invalidate other processes' caches; do not assume a single process.
- Bound caches: max entries, TTL, and eviction metrics.

## 6. Transactions & concurrency

- Use a transaction for multi-row invariants (create channel row + clear old owner row).
- Prefer atomic conditional writes:

```sql
UPDATE giveaways SET claimed_by = ?
WHERE id = ? AND claimed_by IS NULL;
```

- Handle unique-constraint violations as expected outcomes (another process won the race).
- Keep transactions short; never await Discord API calls inside a transaction.

## 7. Backups & retention

- Back up before migrations; keep a restore drill in the runbook.
- SQLite: use the backup API or `.backup`, not a raw copy of a live WAL database.
- Define retention per table: logs, transcripts, tickets, moderation history.
- Support user/guild deletion requests: delete or anonymize across all stores, including caches.
- Export paths must respect permissions and avoid leaking other guilds' data.

## 8. Query hygiene

- Avoid N+1: fetch lists in one query, then map.
- Paginate large lists; never `SELECT *` for unbounded tables.
- Use `EXPLAIN`/query plans for slow paths; add composite indexes for common filters.
- Set timeouts on external DB calls; do not hold gateway handlers hostage.
- Close connections on shutdown; flush WAL; log slow queries above a threshold.

## 9. Checklist

- [ ] Store choice justified; SQLite not shared unsafely across processes
- [ ] Schema enforces invariants; indexes exist for hot queries
- [ ] Migrations additive, idempotent, tested on realistic data
- [ ] SQL isolated in repositories; handlers deal in plain data
- [ ] Cache has TTL, invalidation and bounds
- [ ] Transactions used for multi-row invariants; no API calls inside
- [ ] Backup/restore and retention documented
- [ ] Query plans checked for slow paths
