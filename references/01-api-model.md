# 01 — Discord API Model

Primary sources:
- https://discord.com/developers/docs/intro
- https://discord.com/developers/docs/topics/gateway
- https://discord.com/developers/docs/topics/rate-limits
- https://discord.com/developers/docs/topics/permissions
- https://discord.com/developers/docs/resources/message
- https://discord.com/developers/docs/resources/webhook

## 1. Choose the transport

| Transport | Use when | Notes |
|---|---|---|
| Gateway (WebSocket) | Bots reacting to events in real time | Requires intents; one connection per shard; heartbeat/resume |
| REST | Sending, editing, fetching, registering commands | Rate limited per bot/route; can be used without a gateway |
| HTTP interactions (webhook) | Serverless apps, slash-only bots | Discord sends signed requests; verify Ed25519; 3s ack still applies |
| Webhooks (execute) | One-way messages to channels | No bot user required; `?with_components=true` for CV2 |
| OAuth2 | Dashboard login / add-to-guild | Scopes + state/PKCE; never trust client-side guild lists |

A bot can mix gateway + REST. A dashboard usually adds REST/OAuth2 and a WebSocket of its own
(bot → dashboard), not a second gateway connection.

## 2. Intents

- Request the **minimum** set. Map every feature to an intent before coding.
- Privileged: `GUILD_MEMBERS` (1 << 1), `GUILD_PRESENCES` (1 << 8), `MESSAGE_CONTENT` (1 << 15).
  They must be enabled in the Developer Portal; apps in 100+ guilds also need them approved during
  verification.
- Sending an intent you are not allowed to use closes the connection with **`4013` Invalid
  intent(s)** or **`4014` Disallowed intent(s)** — a boot failure, not a runtime bug.
- Missing intent symptoms: empty member cache, empty message content, no presence updates,
  reaction events absent.
- `GUILD_MODERATION` (1 << 2) and `AUTO_MODERATION_EXECUTION` (1 << 21) are needed for audit-log /
  AutoMod work; `GUILD_EXPRESSIONS` (1 << 3) covers emoji/sticker/soundboard events.
- Event-by-event mapping lives in `13-events.md`; do not guess which intent carries an event.

Checklist:

- [ ] Each feature lists required events → intent(s)
- [ ] Privileged intents justified and enabled
- [ ] Partials configured for DMs/uncached messages if the feature needs them
- [ ] Cache limits set intentionally (messages, reactions, presences)

## 3. IDs (snowflakes)

- Treat IDs as **strings**. JavaScript numbers lose precision above 2^53.
- A snowflake encodes a timestamp; useful for `createdAt`, sorting, and age checks.
- IDs are unique per resource type; never infer type from length alone.
- When parsing URLs/mentions, strip `<@!?>`, `<#>` before validating `^\d{17,20}$`.
- Store IDs as text in SQL when the language/driver does not have a native 64-bit type.

## 4. Limits that bite

Always verify current values in the docs; these are the common ones:

| Area | Limit |
|---|---|
| Interaction initial response | 3 seconds |
| Interaction token lifetime | 15 minutes (edit original/follow-ups) |
| Message content | 2,000 characters (bots cannot exceed this; the 4,000-character allowance is a client-side premium feature, not a bot API limit) |
| Embeds per message | 10 |
| Total embed characters | 6,000 |
| Embed title / description | 256 / 4,096 |
| Embed fields | 25; name 256; value 1,024 |
| Embed footer / author name | 2,048 / 256 |
| Components V2 message | 40 total components; `content`/`embeds` disabled |
| Action row (classic) | 5 rows; 5 buttons per row; 1 select per row |
| `custom_id` | 1–100 characters, unique per message |
| Button label | 80 characters |
| Select options | 25; label/value/description 100 |
| Global chat-input commands | 100 (plus 15 user + 15 message context commands, 1 primary entry point) |
| Options per command | 25 (subcommands/groups count toward the tree) |
| File upload (default) | 25 MB per file (boost tiers raise the guild limit) |
| Global REST rate limit | 50 requests/second per bot, independent of per-route buckets |

Practical rules:

- Truncate before sending, not after a `400 Bad Request`.
- Paginate lists instead of one giant embed; 10 embeds is a hard ceiling.
- Chunk bulk DMs/edits; do not loop unbounded REST calls.
- Feature-detect newer component types; older clients and libraries may not support them.

## 5. Rate limits

- Two layers: **per-route buckets** and a **global** limit per bot.
- Read `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset-After`,
  `X-RateLimit-Bucket`, and on 429 `Retry-After` / `X-RateLimit-Scope`.
- Bucket identity is the `X-RateLimit-Bucket` hash, not the URL; routes can share buckets.
- Major parameters (`guild_id`, `channel_id`, `webhook_id`) create independent limits.
- On 429: wait `retry_after` (seconds, float), add jitter, retry. Do not use fixed sleeps.
- Cloudflare bans can follow sustained abuse; back off hard and log.
- The library's REST manager usually handles this. Do not build a second limiter on top unless
  you batch across processes; if you do, make it bucket-aware.

## 6. Authentication & secrets

- Bot token: `Authorization: Bot <token>`. Never ship in client code or logs.
- OAuth2: `client_id`, `client_secret`, redirect URI allowlist, `state` validation; store sessions
  server-side. Scope minimization (`identify`, `guilds`, `guilds.join` only if needed).
- Webhook: token in URL is a secret; verify signatures where Discord provides them.
- Rotate tokens after exposure; separate applications for dev and prod.
- Redact tokens, webhook URLs, and OAuth codes in logs and error trackers.

## 7. Direct webhooks (stateless alerts)

Direct incoming webhooks execute message sends without running a WebSocket gateway client or maintaining a bot process:

- **Endpoint**: `POST /api/v10/webhooks/{webhook.id}/{webhook.token}`
- **The `?wait=true` query parameter**:
  - Default (`?wait=false` or omitted): Returns `204 No Content` immediately. Discord does not return the created message ID.
  - With `?wait=true`: Discord creates the message and returns the full `Message` object (`200 OK`) including the snowflake `id`. **Always pass `?wait=true`** if you plan to edit, delete, or cross-reference the posted message later.
- **Rate limit isolation**:
  - Webhooks have an independent rate limit bucket: **30 requests per minute per webhook URL**.
  - Exceeding this triggers `429 Too Many Requests` with a `Retry-After` header specific to that webhook URL, completely isolated from your bot token's 50 req/sec global limit.
- **Message lifecycle**:
  - Edit: `PATCH /api/v10/webhooks/{webhook.id}/{webhook.token}/messages/{message.id}`
  - Delete: `DELETE /api/v10/webhooks/{webhook.id}/{webhook.token}/messages/{message.id}`
- **Thread & forum routing**:
  - `?thread_id={thread.id}`: Routes message into an existing thread or forum post.
  - Payload field `"thread_name": "Title"`: In a forum channel, automatically creates a new thread with this title.
- **Payload customization**:
  - `username` and `avatar_url` can be overridden per request.
  - Supports standard `embeds`, `components` (requires `?with_components=true` for CV2), and explicit `allowed_mentions`.

## 8. Registration and scope

- Global commands: available everywhere, propagation can take time.
- Guild commands: instant, ideal for development; remember to clear stale ones.
- Register on startup only when the payload changed, or use a deploy script; avoid duplicate
  registrations from every shard.
- Keep command payloads deterministic: sort options, stable localization keys.
- Context commands (user/message) are separate types; do not mix them with chat-input options.

## 9. Checklist

- [ ] Transport chosen and documented (gateway vs HTTP interactions)
- [ ] Intents mapped per feature, privileged ones justified
- [ ] Snowflakes handled as strings
- [ ] Limits validated/truncated before send
- [ ] Rate limiting delegated to the library or a bucket-aware limiter
- [ ] Secrets only in env; OAuth state verified
- [ ] Command registration is single-owner and idempotent
