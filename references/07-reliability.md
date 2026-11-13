# 07 — Reliability & Observability

Primary references:
- https://discord.com/developers/docs/topics/gateway
- https://github.com/pinojs/pino
- https://github.com/siimon/prom-client
- https://github.com/open-telemetry/opentelemetry-js

## 1. Connection lifecycle

Understand and handle:

| Event | Meaning | Action |
|---|---|---|
| Ready | Initial connect | Register commands once, start timers once |
| Resumed | Session resumed | Do not re-register commands or re-run setup |
| Disconnect | Gateway dropped | Let the library reconnect; alert if frequent |
| Reconnecting | Retry | Backoff is handled by the library; do not stack retries |
| Error | Transport/auth error | Log with code; fatal for invalid token/intents |
| Shard death | Process/cluster died | Respawn/restart; verify state hydration |
| Rate limited (gateway) | Identify throttling | Wait; avoid reconnect storms |

Never create a second gateway client for a feature. One client, many handlers.

## 2. Sharding & processes

- Shard math depends on guild count. Hard ceiling: **2,500 guilds per shard**; above that, sharding
  is mandatory. Use the `shards` value returned by `GET /gateway/bot` instead of guessing.
- Protect IDENTIFY: `max_concurrency` per 5s and **1,000 IDENTIFY / 24h** — exceeding it resets the
  bot token. Always resume where possible; never restart-loop shards.
- One shard manager/cluster manager per host; workers are stateless where possible.
- Cross-shard reads: use REST or `broadcastEval`-style mechanisms; never read another shard's
  in-memory cache directly.
- Command registration: exactly one process owns it; guard with an env flag or leader election.
- Timers/schedulers: one owner or distributed lock; otherwise N shards fire N times.
- Health: expose shard readiness/latency; restart a shard that is wedged, not the whole fleet.

## 3. Memory hygiene

Common leaks:

- Unbounded `Map`/`Set` of users, channels, tickets, cooldowns
- Collectors and intervals never cleared
- Message/attachment caching without limits
- Event listeners added per command invocation
- Large buffers (transcripts, images) retained after send

Rules:

- Cache with max size + TTL; expose cache size metrics.
- Clear intervals/timeouts in `finally` and on shutdown.
- Prefer IDs over full objects in long-lived structures.
- Stream/upload large files; release buffers.
- Run a soak test (hours) with realistic traffic before scaling.

## 4. Timeouts & failure isolation

- Every external call (DB, HTTP, Discord REST) gets a timeout.
- Every event handler gets a try/catch; log and continue.
- Circuit-break flaky external services; degrade gracefully (disable feature, clear message).
- Retries only for transient failures; never retry a failed interaction response.

## 5. Logging

Use structured logs (JSON) with stable fields:

```json
{
  "level": "error",
  "time": "...",
  "service": "bot",
  "shard": 0,
  "guildId": "...",
  "userId": "...",
  "command": "ticket close",
  "correlationId": "...",
  "durationMs": 812,
  "err": { "message": "...", "code": 10062 }
}
```

Rules:

- Redact tokens, webhook URLs, OAuth codes, emails, and message content where privacy matters.
- Log decisions, not just errors: permission denies, rate-limit hits, fallbacks.
- One correlation ID per interaction/job, propagated to actions and logs.
- Avoid logging entire payloads; they are large and often sensitive.
- Keep debug logs off in production by default.

## 6. Metrics

Track at minimum:

- Gateway: ping, shard up/down, reconnects, resume failures
- Commands: count, latency p50/p95/p99, error rate by command
- Interactions: ack latency, `10062` count, defer ratio
- Queue: depth, wait time, failures, dead-letter count
- DB: query latency, slow queries, connection errors
- Process: memory, event-loop delay/GC pauses, CPU
- Product: active guilds, feature usage, cache hit ratio

Alert on symptoms users feel: error rate, p95 latency, queue backlog, shard offline.

## 7. Health & readiness

- `/health/live`: process is running.
- `/health/ready`: gateway connected, DB reachable, migrations applied.
- Do not report ready during startup migrations or command registration.
- Include version/commit and shard info in health output.

## 8. Graceful shutdown

On SIGINT/SIGTERM:

1. Stop accepting new jobs/interactions.
2. Wait for in-flight work with a deadline.
3. Persist queue/timer state.
4. Close DB connections, flush logs/metrics.
5. Exit non-zero only on failure.

Docker/K8s: set `terminationGracePeriodSeconds` above your deadline; handle pre-stop hooks.
PM2: use `kill_timeout` and `wait_ready` where appropriate.

## 9. Incident checklist

- [ ] Which shards/guilds are affected? Scope blast radius.
- [ ] Recent deploy/migration? Roll back first if correlated.
- [ ] Rate limits or Cloudflare bans? Check headers and logs.
- [ ] Queue backlog or dead-letter growth? Pause producers, drain.
- [ ] Memory/event-loop saturation? Capture heap/CPU before restart if possible.
- [ ] Data integrity: are rows still consistent after restart?
- [ ] Add a regression test or monitor for the failure mode.
