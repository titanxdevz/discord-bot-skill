# 15 — Performance, Caching & Profiling

Measure first. Most "the bot is slow" reports are one of: an unindexed query, an unbounded cache,
sync work on the dispatch path, or fetches that should have been cache hits.

## 1. Where the time goes

| Symptom | Likely cause | First check |
|---|---|---|
| Slow commands, gateway fine | DB query / external API on the hot path | Query plan, p95 per action |
| Gateway heartbeat late | Event loop blocked by sync work | Event-loop delay histogram |
| Memory climbing | Unbounded caches, collectors, buffers | Heap snapshot, cache sizes |
| REST 429s | Request storms, N+1 sends | Rate-limit headers, call counts |
| Slow startup | Fetching everything at boot | Startup timing, `READY` work |
| Voice stutter | CPU saturation from transcoding | CPU per connection, worker offload |

## 2. Cache strategy

Default posture: **cache what you read repeatedly, not everything the library offers.**

For discord.js, bound the cache explicitly instead of trusting defaults:

```ts
const client = new Client({
  intents: [...],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 50,       // keep a short window, not history
    PresenceManager: 0,       // almost no bot needs presence caching
    ReactionManager: 0,
    GuildMemberManager: 200,  // only if member lookups are hot
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: { interval: 300, lifetime: 1_800 },   // seconds
    users: { interval: 3_600, lifetime: 3_600 },
  },
});
```

- Sweeper keys available in 14.x include `messages`, `users`, `guildMembers`, `presences`,
  `reactions`, `threads`, `threadMembers`, `invites`, `bans`, `emojis`, `stickers`,
  `voiceStates`, `applicationCommands`, `autoModerationRules`, `entitlements`, `stageInstances`.
- For one-off lookups prefer `fetch()` over keeping a permanent cache entry.
- Never treat a cache as authorization or as the source of truth (`08-security`, `05-data-layer`).
- Add a per-process cache size metric; a cache without a bound is a leak.

Application-level caches:

- Per-guild config: in-process LRU + TTL, invalidated on write; Redis when multi-process.
- Cooldowns/quota counters: Redis with TTL, not a `Map` per shard.
- Rendered panels/payloads: cache the built payload if it is expensive, keyed by content hash.

## 3. Event-loop and hot-path hygiene

- No sync I/O (`readFileSync`, `execSync`, big `JSON.parse`) inside event handlers.
- No image/canvas/transcode/PDF work on the dispatch path — worker thread or job queue.
- No `await` inside a loop over members/messages; batch and bound concurrency (`06-queues-jobs`).
- Avoid re-serializing large objects per event; pass IDs and fetch what you need.
- Use `AbortSignal.timeout()` on outbound HTTP so a hung dependency cannot pin a handler.

## 4. Profiling recipes

Node.js:

```bash
node --cpu-prof --cpu-prof-dir=./prof dist/index.js     # CPU profile for Chrome DevTools
node --heap-prof --heap-prof-dir=./prof dist/index.js   # allocation profile
node --inspect dist/index.js                            # live heap snapshots
```

```ts
import { monitorEventLoopDelay } from 'node:perf_hooks';
const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();                                   // read h.percentile(99) / h.max in metrics
```

- Compare heap snapshots before/after a soak: retained `Message`, `GuildMember`, buffers, arrays.
- Watch RSS after each deploy; a step change is a regression, not noise.
- Python: `tracemalloc` snapshots, `cProfile`, `py-spy dump --pid` for a hung process.
- Rust/Java/.NET: built-in profilers and allocation counters; measure per-shard, not per-host.

Load testing:

- Replay synthetic events into handlers (no gateway) to measure your code, not Discord.
- Use a dedicated test guild for end-to-end checks; never production tokens.
- Report p50/p95/p99, error rate, and queue depth — not averages.

## 5. Scaling math

- Memory ≈ shard count × (guild cache + member cache + message window). Reducing the message
  window often buys more than adding hosts.
- 2,500 guilds per shard is a hard ceiling, not a target; shard when event volume or guild count
  demands it (`10-deployment`).
- One process per shard is simple; one process with many shards is cheaper but a single crash takes
  them all. Choose deliberately and document it.
- Connection pools: size to CPU cores × 2, and cap below the database's `max_connections`.
  Too many pool clients is a common cause of "random" DB latency.
- Redis: pipeline batch reads, avoid `KEYS`, give every key a TTL and a namespace.

## 6. Payload and API efficiency

- Batch what Discord batches: bulk delete, member fetch, command registration (one PUT).
- Reuse one message and edit it instead of sending per state change (`11-ux-patterns`).
- Send only the fields that changed on edit where the API allows it.
- Compress/stream large files; do not hold transcripts in memory to attach them.
- Respect `Retry-After`; a retry storm is slower than waiting.

## 7. Budgets worth writing down

| Path | Budget |
|---|---|
| Interaction ack | < 3 s hard; aim < 300 ms |
| Command p95 (excluding deferred work) | < 500 ms |
| DB query p95 | < 50 ms |
| Cache hit ratio for config | > 95 % |
| Event-loop p99 delay | < 50 ms |
| Shard resume time | < 30 s |
| RSS growth over 24 h soak | ~0 |

A budget without a metric is a wish. Emit the metric before claiming the budget.

## 8. Checklist

- [ ] Cache limits and sweepers set explicitly, sizes observable
- [ ] No sync/CPU-heavy work on the dispatch path
- [ ] Slow-path queries have indexes and measured p95
- [ ] Event-loop delay and RSS exported as metrics
- [ ] Load/soak test run before scaling claims
- [ ] Scaling model documented (shards, processes, pools)
- [ ] Budgets defined and alerted on
