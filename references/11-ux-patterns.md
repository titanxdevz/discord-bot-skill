# 11 — UX Patterns for Discord Bots

Discord UI is a chat surface: messages are immutable history, edits are visible, and users are on
mobile. Design for the second interaction, not the first.

## 1. Panel types

| Panel | Purpose | Typical controls |
|---|---|---|
| Control panel | Operate an existing resource (voice channel, ticket) | Rename, limit, lock, transfer, delete |
| Interface panel | Browse/navigate content (help, shop, leaderboard) | Select menu, prev/next, filter |
| Setup panel | Configure the bot for a guild | Retrofit selects, toggles, save |
| Status/record panel | Show current state, rarely interactive | Refresh, close, transcript |

Every panel needs: a single owner message, a stored message ID (if it must survive restarts), a
stable `custom_id` scheme, and a cleanup path.

## 2. One message, edited in place

- Post once; update with `edit`/`update` on each interaction.
- Store `channel_id` + `message_id` in the DB, not in memory.
- If the message was deleted, recreate it and update the stored ID; do not error out forever.
- If the resource is gone, delete the panel and remove rows.
- Never send a new panel per event (join, purchase, page view). It floods the channel and orphans
  messages nobody can maintain.

## 3. Common flows

**Pagination**

```text
[◀ Prev]  Page 2/7  [Next ▶]   [Jump ▾]
```

- Encode page in `custom_id` (`help:page:2`) or a short session key.
- Disable, don't hide, controls at boundaries (layout stays stable).
- Re-check visibility permission on every page change.
- Keep total components under the limit and the message under the char limit.

**Confirmation for destructive actions**

```text
Delete "support-0142"? This cannot be undone.
[Delete]  [Cancel]
```

- Use `Danger` style for the destructive button; `Secondary` for cancel.
- Confirm inside the same message (edit) or a modal, not a new channel message.
- Re-verify permission **after** confirmation: state may have changed.
- Make repeated confirmation idempotent: second click says "already deleted".

**Multi-step setup (wizard)**

- One step per message edit; keep the step in `custom_id` or DB state.
- A `Cancel` button is always present.
- Validate each step before advancing; keep entered values so users can go back.
- Persist progress; a restart must not lose a half-finished setup.

**Ticket lifecycle**

```text
open → claimed → closed (→ transcript → delete after N days)
```

- Buttons: claim, close, transcript. Claim is first-writer-wins (atomic update).
- Closed tickets disable all controls; keep the record for history.
- Transcript generation is queued, never inline in the close interaction.
- Reopening is a new state transition with permission checks, not a fresh ticket.

**Giveaways**

- Store end time in UTC; schedule a durable job, not a sleeping task.
- Panel edit updates entries count; entry buttons are idempotent per user.
- Draw at end with a seeded RNG; store winners before announcing.
- Cancelled/ended giveaways disable buttons; late clicks get a clear message.

## 4. Ephemeral vs public (decide per response)

| Response | Ephemeral | Public |
|---|---|---|
| Errors, validation, permission failures | ✅ | |
| Personal settings, balance, private data | ✅ | |
| Setup wizard | ✅ | |
| Channel-visible state changes (panel update) | | ✅ |
| Announcements, results | | ✅ |

- Ephemeral messages vanish on client reload — never the only record of a decision.
- Do not edit an ephemeral message into public content or vice versa; open a new response instead.
- Follow-ups should match the initial response's visibility unless there is a reason.

## 5. Text & tone

- Front-load the outcome: "Locked. Only staff can join now." not "You have successfully..."
- Name the fix: "I need **Manage Channels** in #support to do that."
- One emoji or icon per meaning, used consistently; avoid emoji-only labels.
- Keep mobile width in mind: short lines, no ASCII tables, no long code blocks in panels.
- Use Discord timestamps (`<t:...:R>`) so every user sees their own timezone.
- Don't ping `@everyone` from bot output unless the user explicitly asked for it.

## 6. Component design rules

- Every button does exactly one thing; no ambiguous labels ("OK", "Yes", "Go").
- Dangerous actions: `Danger` style + confirmation + permission re-check.
- Disable controls during an in-flight operation, then re-enable or remove them.
- Never rely on component state (disabled/enabled) as authorization.
- Keep row layout stable across states so the panel does not jump.
- Avoid more than ~5 interactive controls per panel; beyond that, use a select menu.
- Link buttons for docs/support (`url`), interaction buttons for actions (`custom_id`).

## 7. Accessibility

- Add `description`/alt text to media components.
- Don't encode meaning only in color; use text or emoji.
- Keep contrast in mind for accent colors in CV2 containers.
- Provide a text fallback for image-only content (CV2 → embed → text).
- Avoid rapidly edited messages (screen readers re-announce); batch updates.

## 8. Localization

- Externalize strings; key by feature, not by English text.
- Per-guild locale with a global fallback; store the choice in DB.
- Format numbers/dates per locale; use Discord timestamps for absolute times.
- Allow translated text to be longer: budget limits, don't hardcode English lengths.
- Keep `custom_id` locale-independent; never put translated text in router keys.

## 9. Failure UX

| Situation | Show |
|---|---|
| Slow operation | Defer with a short "Working…" state, then edit |
| Rate limited | "Too many requests — try again in Ns" |
| Missing permission | Permission name + channel/role |
| Resource gone | What disappeared and how to recreate it |
| Already handled | "Already closed by @user" (idempotent) |
| Internal error | Short apology + correlation ID, details only in logs |

Never leave a spinner-state message that never resolves. Always edit the deferred response,
including on failure.

## 10. Checklist

- [ ] Panel posted once, edited in place, ID persisted
- [ ] Components disabled/removed when the resource is gone
- [ ] Destructive actions confirmed and re-authorized
- [ ] Pagination respects permissions and boundaries
- [ ] Ephemeral/public choice deliberate per response
- [ ] Timestamps used instead of hand-formatted times
- [ ] Strings externalized if the bot supports locales
- [ ] Every failure path resolves the message with a specific reason
