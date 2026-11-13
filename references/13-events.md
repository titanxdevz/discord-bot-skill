# 13 — Gateway Events, Intents & Partials

Primary sources:
- https://discord.com/developers/docs/events/gateway
- https://discord.com/developers/docs/events/gateway-events
- https://discord.com/developers/docs/topics/opcodes-and-status-codes

Most "the event never fires" bugs are intent bugs. Most "the bot double-processed" bugs are
reconnect bugs. Check those two first.

## 1. Intent map (official, per event family)

| Intent | Bit | Events |
|---|---|---|
| `GUILDS` | 1 << 0 | guild/channel/thread/stage create-update-delete, `CHANNEL_PINS_UPDATE`, `THREAD_LIST_SYNC`, `THREAD_MEMBER_UPDATE`, `VOICE_CHANNEL_STATUS_UPDATE` |
| `GUILD_MEMBERS` **(privileged)** | 1 << 1 | `GUILD_MEMBER_ADD/UPDATE/REMOVE`, `THREAD_MEMBERS_UPDATE` |
| `GUILD_MODERATION` | 1 << 2 | `GUILD_AUDIT_LOG_ENTRY_CREATE`, `GUILD_BAN_ADD/REMOVE` |
| `GUILD_EXPRESSIONS` | 1 << 3 | emoji/sticker/soundboard updates |
| `GUILD_INTEGRATIONS` | 1 << 4 | integration + `GUILD_INTEGRATIONS_UPDATE` |
| `GUILD_WEBHOOKS` | 1 << 5 | `WEBHOOKS_UPDATE` |
| `GUILD_INVITES` | 1 << 6 | `INVITE_CREATE/DELETE` |
| `GUILD_VOICE_STATES` | 1 << 7 | `VOICE_STATE_UPDATE`, `VOICE_CHANNEL_EFFECT_SEND` |
| `GUILD_PRESENCES` **(privileged)** | 1 << 8 | `PRESENCE_UPDATE` |
| `GUILD_MESSAGES` | 1 << 9 | `MESSAGE_CREATE/UPDATE/DELETE`, `MESSAGE_DELETE_BULK` (guilds) |
| `GUILD_MESSAGE_REACTIONS` | 1 << 10 | reaction add/remove/clear |
| `GUILD_MESSAGE_TYPING` | 1 << 11 | `TYPING_START` (guilds) |
| `DIRECT_MESSAGES` | 1 << 12 | `MESSAGE_CREATE/UPDATE/DELETE`, `CHANNEL_PINS_UPDATE` (DMs) |
| `DIRECT_MESSAGE_REACTIONS` | 1 << 13 | reaction events in DMs |
| `DIRECT_MESSAGE_TYPING` | 1 << 14 | `TYPING_START` (DMs) |
| `MESSAGE_CONTENT` **(privileged)** | 1 << 15 | gates `content`, attachments, embeds, components in message events |
| `GUILD_SCHEDULED_EVENTS` | 1 << 16 | scheduled event create/update/delete + user add/remove |
| `AUTO_MODERATION_CONFIGURATION` | 1 << 20 | AutoMod rule events |
| `AUTO_MODERATION_EXECUTION` | 1 << 21 | `AUTO_MODERATION_ACTION_EXECUTION` |
| `GUILD_MESSAGE_POLLS` | 1 << 24 | poll vote add/remove (guilds) |
| `DIRECT_MESSAGE_POLLS` | 1 << 25 | poll vote add/remove (DMs) |

Rules:

- **Privileged** intents (`GUILD_MEMBERS`, `GUILD_PRESENCES`, `MESSAGE_CONTENT`) must be enabled in
  the Developer Portal; verified apps (100+ guilds) also need approval.
- Sending an intent you are not allowed to use closes the connection with **`4013` Invalid intent(s)**
  or **`4014` Disallowed intent(s)** — a boot-time failure, not a runtime bug.
- Events not listed above (interactions, entitlements, subscriptions, voice server updates) are
  always delivered; they do not need an intent.
- `MESSAGE_CONTENT` off does **not** stop message events — it strips `content`, `embeds`,
  `attachments`, `components`, and `poll` from them. Bots that only need command interactions
  should not request it.

## 2. Dispatch lifecycle

| State | Meaning | Correct reaction |
|---|---|---|
| `READY` (`ClientReady`) | First connect for this shard | Start timers, register or load caches **once** |
| `RESUMED` | Session resumed after a drop | Do **not** re-run setup, do not re-register commands |
| Close `4000–4099` | Unrecoverable for this session | Reconnect per code; `4004` auth failed = fix token |
| `9` Invalid session | Session lost (`d` false = no resume) | Re-identify, but respect `max_concurrency` |
| `7` Reconnect | Discord asks you to reconnect | Resume immediately with backoff |

- Gateway ops are handled by the library. Do not build a second reconnect loop on top.
- After a resume, Discord may replay missed dispatches. Handlers must be **idempotent** (dedupe by
  message/interaction ID or a DB unique key); do not assume each event arrives exactly once.
- Never create a second gateway client for a feature; one client, many handlers.
- Shard death is a process-level event: respawn it, then verify hydration before accepting work.

## 3. Partials / uncached entities (discord.js mapping, same idea elsewhere)

| Partial | Enables |
|---|---|
| `Partials.Channel` | DM channels (required for DM events) |
| `Partials.Message` | reactions/edits on uncached messages |
| `Partials.Reaction` | reaction events on old messages |
| `Partials.User` | DM user objects |
| `Partials.GuildMember` | member events when the member is not cached |
| `Partials.ThreadMember` | thread member events |
| `Partials.GuildScheduledEvent` | scheduled event updates |

Enabling partials without handling `partial` entities is a common crash source: `message.content`
can be `null`, `message.author` may be a partial user. Either handle the partial (fetch it) or do
not enable it. Partials are not a fix for a missing intent.

## 4. Ordering & races

- `GUILD_CREATE` arrives before most guild events on a fresh session, but **not** before events
  replayed after a resume. Never assume a guild object exists; fetch on miss.
- `INTERACTION_CREATE` can arrive while the message it targets is still being written. Re-fetch
  state instead of trusting the interaction payload.
- `MESSAGE_UPDATE` fires for embeds/link previews and pin changes, not only edits; compare content
  before treating it as a user edit.
- `VOICE_STATE_UPDATE` storms during mass moves; debounce per member instead of acting per event.
- Events for one guild are not serialized. Serialize state-changing work with a per-guild queue,
  lock, or atomic DB update.

## 5. Handler shape

```text
on event:
  - validate shape (partial? missing fields?)
  - dedupe (event/message id, DB unique key) when the handler mutates state
  - enqueue or execute with a timeout
  - catch everything; log with guild/channel/user/correlation id
  - never throw out of the listener
```

- One listener per event file is easier to audit than many ad-hoc `client.on` calls.
- Keep heavy work off the dispatch path: hand it to a queue (`06-queues-jobs`).
- Don't log full payloads; they are large and contain user content.

## 6. Debugging "the event doesn't fire"

1. Is the intent requested in the client options **and** enabled in the portal?
2. Is the event in the intent's family (table above)? DM vs guild intents are separate.
3. Is a partial required for uncached entities?
4. Did the handler throw earlier in the same listener (swallowed by a catch)?
5. Is the shard that owns the guild connected? Check `client.ws.ping`, shard status, `guild.shardId`.
6. Is the bot actually in that guild/channel with View Channel?

## 7. Checklist

- [ ] Every event used by the code maps to a requested intent
- [ ] Privileged intents enabled in the portal and justified
- [ ] Partials deliberate, with null/partial handling
- [ ] `READY` vs `RESUMED` handled differently
- [ ] Handlers idempotent against replayed dispatches
- [ ] Listener errors contained and logged with context
- [ ] No second gateway client, no custom reconnect loop
