# 08 — Security

## 1. Authorization model

Every mutating action checks, in order:

1. **Actor exists and is allowed** (owner, admin, permission, role, whitelist).
2. **Bot has the required permission** in the target channel/guild.
3. **Hierarchy** allows the action (role position, channel overwrites).
4. **Resource ownership/state** matches (ticket open, channel tracked, application pending).

Rules:

- Hiding a button is not authorization. Re-check on click and on command.
- Check channel overwrites, not only guild-level roles.
- Guild owner and Administrator bypass most checks by design; state that explicitly.
- For destructive actions, require confirmation and log the actor.
- Never trust IDs, guild IDs or permissions embedded in `custom_id`; resolve from context.

## 2. Permissions & hierarchy

- Compare role positions for role add/remove, nickname changes, and moderation.
- Check `manageable`/`bannable`/`kickable` equivalents where the library exposes them.
- Bots cannot act on roles above their highest role; surface "role above bot" clearly.
- Channel overwrites: compute effective permissions for member and bot in that channel.
- DM commands: guild-only features must reject DMs with a specific message.
- Ephemeral responses do not make an unauthorized action safe.

## 3. Input validation

Validate at every boundary: commands, buttons, modals, REST routes, webhooks, DB reads.

- IDs: regex `^\d{17,20}$` after stripping mentions.
- Numbers: integer/float, min/max, NaN rejection.
- Strings: max length, control characters, markdown injection.
- URLs: scheme allowlist (`https`), no localhost/private IPs if fetching server-side (SSRF).
- Mentions: never allow `@everyone`/`@here` from user input; always set safe `allowed_mentions`:
  - Default recommended policy: `allowedMentions: { parse: ['users'], roles: [], repliedUser: true }`
  - Never allow `parse: ['everyone', 'roles']` on commands reflecting user strings (echo, announce, embed builders).
- File uploads: check type/size, store outside the web root, scan if exposed.
- JSON: schema-validate before use; reject unknown fields for sensitive actions.

## 4. Secrets

- Tokens, client secrets, API keys: env/secret manager only.
- Never commit `.env`; commit `.env.example` with placeholders.
- Redact secrets from logs, error trackers, transcripts, and command output.
- Rotate immediately after exposure; check git history and build artifacts.
- Separate dev/staging/prod applications and tokens.
- Webhook URLs contain secrets; treat them as credentials.

## 5. OAuth2 / dashboard

- Use `state` (and PKCE where supported) and validate it per session.
- Redirect URI allowlist; exact match, no wildcards.
- Minimal scopes; do not request `guilds.join` unless used.
- Store sessions server-side; httpOnly, secure, sameSite cookies.
- Verify guild membership/permissions server-side for every dashboard action.
- CSRF protection for cookie-based flows; rate-limit auth endpoints.
- Do not trust `guilds` returned by the client; re-fetch with the token.

## 6. Webhooks & signatures

- Discord interaction webhooks (HTTP apps): verify Ed25519 signature + timestamp before processing.
- Third-party webhooks: verify HMAC/signature, reject replays (timestamp/nonce).
- Constant-time comparisons for secrets/signatures.
- Respond fast, queue the work; do not exceed the ack window.
- Validate the webhook token/ID pair; never trust a payload-provided guild ID alone.

## 7. Abuse prevention

- Cooldowns & Token Bucket: enforce per-user command buckets (e.g. max 5 commands / 10s per user ID via Redis/in-memory LRU) to drop spam before hitting Discord API 429 limits.
- Stricter cooldowns for expensive operations (AI generation, image rendering, data exports).
- Anti-raid circuit breaker: if invocation or join velocity exceeds baseline, throttle background jobs and enforce verification requirements.
- Quotas and allowlists for destructive features; feature flags default off.
- Anti-nuke: rate-limit destructive audit-log actions, snapshot/restore, alert owners.
- AutoMod: native rules plus app-level filters (invites, spam, mass mentions, phishing).
- Detect self-bots/raid patterns; require verification for risky commands.
- Log actor + reason + before/after for audit-critical actions.

## 8. Data protection

- Collect the minimum data; document why each field exists.
- Encrypt sensitive fields at rest where feasible (tokens, private notes).
- Retention limits for transcripts, logs, moderation history.
- Right-to-delete: purge across DB, caches, backups, and third-party services.
- Access control for dashboards/API; audit reads of sensitive data.
- Avoid storing message content unless the feature requires it.

## 9. Supply chain & runtime

- Pin dependencies; audit lockfiles; review major upgrades.
- Avoid running untrusted plugins/eval/user JS.
- Principle of least privilege for the bot role and host user.
- Keep the runtime and libraries patched; subscribe to security advisories.
- Sanitize error messages returned to users; keep stack traces server-side.

## 10. Review checklist

- [ ] Every mutating path checks actor, bot, hierarchy, ownership
- [ ] Inputs validated (IDs, numbers, strings, URLs, mentions, files)
- [ ] Secrets env-only, redacted, rotatable
- [ ] OAuth state/PKCE, redirect allowlist, server-side permission checks
- [ ] Webhook signatures verified; replay protection
- [ ] Cooldowns/quotas; destructive features flagged off by default
- [ ] Retention + deletion implemented
- [ ] Dependencies audited; least-privilege bot role
