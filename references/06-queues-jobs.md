# 06 — Queues, Jobs & Rate-Limit-Aware Work

Three separate problems, often confused:

1. Discord rate limits (REST buckets/global)
2. Application concurrency (don't run 500 jobs at once)
3. Durability (a job must survive a restart)

Solve them separately.

## 1. Discord rate limits

- Let the library's REST manager handle buckets; do not add fixed sleeps.
- If you need a cross-process limiter, key it by `X-RateLimit-Bucket` + major parameters
  (`guild_id`, `channel_id`, `webhook_id`).
- Honor `429` `retry_after` (seconds, float) and `X-RateLimit-Scope` (user/global/shared).
- Add jitter to retries; cap attempts; surface permanent failures.
- Bulk endpoints exist for a reason (bulk delete, member fetch, command registration); use them
  instead of N single calls.

## 2. In-process concurrency

| Tool | Use |
|---|---|
| `p-queue` (JS) / semaphore (any language) | Bound concurrency for one process |
| Per-guild keyed queue | Serialize mutations for the same guild |
| Batched worker | Chunk large operations (members, messages) |
| No queue | Fast, independent reads where order does not matter |

Rules:

- Set concurrency from measurement, not guesswork (start 5–20 for REST-heavy work).
- Serialize per guild when operations mutate shared state (channel ownership, ticket state).
- Always bound retries and total queue size; reject/backpressure when full.
- Log queue depth and job duration; a growing queue is an incident.

## 3. Durable queues

Use durable queues (BullMQ/Redis, SQS, RabbitMQ, DB-backed jobs) when:

- the job must survive a bot restart (giveaway end, scheduled announcement)
- multiple workers/clusters must share the work
- you need retries, dead-letter, or delayed execution

Design:

- Job payload: IDs and minimal data, never full Discord objects or tokens.
- Idempotency: every job has a stable key; re-running must be safe.
- Retries: exponential backoff + jitter, max attempts, dead-letter with alerting.
- Expiry: scheduled jobs must check current state (giveaway cancelled? channel gone?).
- Locks: one worker per resource (Redis lock/DB row lock); release on crash via TTL.
- Observability: job name, attempts, duration, failure reason, correlation ID.

## 4. Schedulers

- Use a real scheduler (cron/APScheduler/BullMQ delayed jobs/Tokio interval) over ad-hoc
  `setInterval` in event handlers.
- Persist next-run time; catch up or skip explicitly after downtime. Document the policy.
- Timezone: store UTC, render local; never assume server timezone.
- Drift: schedule by absolute time, not by sleeping `interval` repeatedly.
- Missed runs: one catch-up run, not a burst of all missed runs.
- Guard against duplicate schedulers when sharding (one owner or a distributed lock).

## 5. Common jobs

| Job | Notes |
|---|---|
| Giveaway end | Idempotent draw; store winners; edit panel |
| Reminder/timer | Store due timestamp; cancel on user action |
| Ticket auto-close | Check last activity, not creation time |
| Temp voice cleanup | Verify channel empty and still tracked |
| Bulk role/member ops | Chunked, rate-limit aware, resumable |
| Cache refresh | Bounded; skip if still fresh |
| Transcript generation | Queue it; never block the interaction reply |

## 6. Retry policy

```
attempt 1: immediate
attempt n: delay = base * 2^(n-1), cap at max, plus jitter(0..30%)
permanent errors: 4xx except 429 → do not retry
transient: network, 5xx, 429, timeout → retry
after max: dead-letter + alert; do not loop forever
```

Log the final failure with enough context to reproduce; do not log secrets.

## 7. Backpressure & shutdown

- When the queue is full: reject with a clear message or delay, never silently drop.
- On SIGTERM: stop accepting jobs, finish in-flight with a deadline, persist unfinished work,
  flush logs/metrics, then exit.
- Ensure timers and intervals are cleared; dangling timers keep the process alive.
- After a crash, recovery must not double-process; use idempotency keys and locks.

## 8. Checklist

- [ ] Discord rate limits delegated or bucket-aware, never hardcoded
- [ ] Concurrency bounded; per-guild ordering where needed
- [ ] Durable jobs for anything that must survive restart
- [ ] Idempotency key + retry/backoff/dead-letter
- [ ] Scheduler stores UTC due times and documents catch-up
- [ ] Queue depth/duration/failures are observable
- [ ] Graceful shutdown drains or persists work
