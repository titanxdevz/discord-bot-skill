# 12 — Anti-Patterns & Failure Catalogue

Each entry: symptom → why it happens → fix. Use this when reviewing a bot or debugging a report.

## Interaction lifecycle

| Symptom | Cause | Fix |
|---|---|---|
| "This interaction failed" | No ack within 3s | `deferReply` before slow work |
| `10062 Unknown Interaction` | Acked after the token died, often after a long DB/API call | Defer first; never rely on late acks |
| `40060 Already acknowledged` | Two code paths reply (e.g. handler + catch block) | Single response path; guard with an `acknowledged` flag |
| Response appears twice | `reply` then `followUp` with the same content | `editReply` for the original, follow-ups only for extra content |
| Button click does nothing | Handler threw before ack, error swallowed | Wrap in try/catch; always respond |
| Ephemeral reply turns public | `followUp` visibility defaults differ | Pass visibility explicitly |
| Modal never opens / 40060 error | Called deferReply() before showModal() | showModal MUST be the initial interaction response; cannot defer or reply first |
| Modal renders but inputs missing | Action Row + Text Input (deprecated in modals) | Use `Label` wrapping the input |

## Gateway & events

| Symptom | Cause | Fix |
|---|---|---|
| Event never fires | Intent missing or not enabled in the portal | Map event → intent (`13-events.md`); enable privileged intents |
| Connection closes on boot (`4013`/`4014`) | Invalid or disallowed intent | Remove the intent or get it approved |
| `content` is empty | `MESSAGE_CONTENT` not enabled | Request the intent (privileged) or use interactions only |
| Crashes on old messages/DMs | Partials enabled but `null` fields not handled | Handle/fetch partial entities, or drop partials |
| Setup runs twice | `RESUMED` treated like `READY` | Gate one-time work on the first `READY` only |
| Duplicate processing after reconnect | Replayed dispatches not deduped | Idempotent handler keyed by message/interaction ID |
| Event ordering surprises | Assuming per-guild ordering | Per-guild queue/lock; re-fetch state |

## Component routing

| Symptom | Cause | Fix |
|---|---|---|
| Wrong handler runs | `custom_id` collisions or prefix matching without delimiters | Namespaced, delimited IDs; exact parse |
| Handler gets garbage IDs | `_`-joined IDs where parts contain `_` | Delimiter that cannot appear in parts |
| Stale actions succeed | Handler trusts the message/component state | Re-fetch resource from DB |
| Anyone can press admin buttons | Permission checked only when rendering | Check in handler |
| Duplicate clicks double-charge | No idempotency | Atomic conditional update; disable during flight |
| Memory grows over days | Collectors never cleaned up | Timeout + `end` cleanup, or central router |
| Works until restart | State kept in a `Map` | Persist to DB, key by message ID |

## Rate limits & throughput

| Symptom | Cause | Fix |
|---|---|---|
| Random 429 bursts | Fixed `sleep` throttling, no bucket awareness | Use the library's REST manager |
| Cloudflare bans | Retry storms on errors | Backoff + jitter; cap retries; log 429 scope |
| Bulk op takes forever | Per-item REST calls in a loop | Bulk endpoints / bounded concurrency |
| Bot stalls globally | One feature saturates the global limit | Isolate background work in a worker with its own budget |
| Duplicate command errors | Every shard registers commands | Single owner for registration |
| 429 flood on bot reconnect | Commands re-registered in ready/on_ready handler | Use standalone deploy script; ready fires on every reconnect |

## Data layer

| Symptom | Cause | Fix |
|---|---|---|
| Data loss on restart | In-memory state as source of truth | DB + migrations |
| Duplicate rows | No unique constraint, check-then-insert race | `UNIQUE` + handle constraint violation |
| Slow queries later | No index on hot filters | Add composite index, verify with plan |
| Migration broke prod | Destructive change + code switch in one release | Expand/migrate/contract over releases |
| Corrupt SQLite | Multiple processes writing the same file, or copying a live WAL DB | Single writer or Postgres; use backup API |
| Cross-shard inconsistency | One shard reconciles from its local cache | Scope queries to owned guilds; don't delete globally |
| N+1 latency | Query per row in a loop | Batch fetch + map |
| Lost writes | Read-modify-write without transaction | Atomic `UPDATE ... WHERE` |

## Reliability

| Symptom | Cause | Fix |
|---|---|---|
| Shard dies, bot half-offline | Unhandled rejection in an event handler | Error boundary per event; supervisor respawn |
| Memory climbs | Unbounded caches, buffers, listeners | Bounded LRU, cleanup, drop buffers |
| Event loop lag | Sync I/O, JSON.parse of huge payloads, canvas work inline | Move to worker/queue |
| Timers fire N times | Every shard schedules the same job | Leader election or distributed lock |
| Zombie connection | Missed heartbeat ACK not handled | Let the library reconnect; alert on repeats |
| Token reset by Discord | IDENTIFY storms (>1,000/24h) | Resume, rollout deploys, no restart loops |
| Hang on deploy | No graceful shutdown | SIGTERM drain with deadline |

## Security

| Symptom | Cause | Fix |
|---|---|---|
| Users trigger admin actions | Buttons hidden but not checked | Server-side permission checks |
| Bot can't moderate a role | Role above the bot's highest role | Hierarchy check + clear error |
| Token leaked | Committed `.env` or logged headers | Secrets in env, redact logs, rotate |
| Dashboard shows other guilds | Trusting client-provided guild list | Re-fetch with the user's token; server-side check |
| Forged interactions (HTTP app) | No Ed25519 verification | Verify signature + timestamp |
| SSRF via user URL | Server-side fetch of arbitrary URLs | Scheme/host allowlist, block private ranges |
| Raid / nuke | No cooldowns or quotas | Rate-limit destructive actions, audit-log alerts |

## Message UI

| Symptom | Cause | Fix |
|---|---|---|
| `400 Bad Request` on send | Over a limit (2,000 chars, 10 embeds, 25 fields, 6,000 embed chars) | Truncate/paginate before sending |
| Components ignored | CV2 flag missing, or non-app webhook without `?with_components=true` | Set flag; add query param |
| `400 Bad Request` with CV2 flag | `content`, `embeds`, `files`, or `poll` sent alongside components | Send components only |
| Content silently missing | CV2 disables `content`/`embeds` | Use Text Display / Container |
| Message can't be "fixed" | CV2 flag is irreversible | Delete and resend; choose deliberately |
| Panel spam | New message per event | One message, edit in place |
| Broken layout on mobile | Wide ASCII/tables, too many rows | Short text, fewer controls |
| Mentions ping everyone | User input echoed with mentions allowed | Explicit allowed mentions |

## Voice

| Symptom | Cause | Fix |
|---|---|---|
| Audio never starts | Played before connection is `Ready` | `entersState(connection, Ready, timeout)` |
| Connects, then silence | UDP blocked (container/NAT), or missing Opus engine | Allow UDP; install opus/ffmpeg; `generateDependencyReport()` |
| No audio received | Joined deafened | `selfDeaf: false` for receive |
| Decryption/DAVE failures | Library without DAVE, or `daveEncryption: false` | Upgrade the library; keep DAVE enabled |
| Connections leak | Player/connection not destroyed on leave or shutdown | Single teardown path for both |
| Voice state storms | Acting per `VOICE_STATE_UPDATE` | Debounce per member, batch moves |

## Code quality

| Symptom | Cause | Fix |
|---|---|---|
| Logic duplicated across slash/prefix/buttons | No action layer | One function per operation |
| Tests require a live bot | Transport coupled to logic | Separate domain/actions from Discord calls |
| Silent failures | Catch-all that logs nothing | Specific messages + correlated logs |
| "Something went wrong" | Generic error mapper | Map known errors to actionable text |
| Regressions on refactor | No payload/contract tests | Snapshot payloads, test limits |
| Framework sprawl | Second framework added to an existing bot | Match the existing stack |

## Review prompts

When auditing, ask in this order:

1. Does every interaction path ack exactly once, within 3s?
2. Is state in the DB, or in a map that dies on restart?
3. Is every mutating path authorized server-side (user, bot, hierarchy, ownership)?
4. Are limits enforced before sending, or discovered via 400s?
5. Do background jobs survive restart, and are they idempotent?
6. Is anything unbounded (cache, queue, collector, retry loop)?
7. Are secrets out of code and logs?
8. Can one failure take down the whole process or shard?
9. Are migrations additive and tested on real data?
10. Is there a test that fails if the bug returns?
