# 02 — Interactions & Routing

Primary sources:
- https://discord.com/developers/docs/interactions/overview
- https://discord.com/developers/docs/interactions/receiving-and-responding
- https://discord.com/developers/docs/interactions/application-commands
- https://discord.com/developers/docs/components/reference

## 1. Lifecycle (the part that breaks)

```
user clicks / types
  → interaction created
  → you MUST acknowledge within 3s:
       reply | deferReply | showModal | autocomplete result
  → token valid ~15 minutes:
       editReply / followUp / deleteReply
```

Rules:

- Exactly **one** initial response per interaction. A second `reply` → `40060 Interaction has
  already been acknowledged`.
- After 3 seconds without ack → `10062 Unknown Interaction` (the token dies).
- After deferring, `reply()` is wrong; use `editReply()` (original) and `followUp()` (extra).
- Deferred responses can be ephemeral or public; choose deliberately.
- Modals are an initial response too. You cannot `reply` then open a modal.
- Autocomplete must respond within 3s and cannot defer like normal commands.

Recommended envelope:

```text
on interaction:
  try:
    route()
  catch error:
    if not acknowledged: ephemeral error
    else if deferred: editReply(error)
    else: followUp(error)
    log(correlationId, command, guild, user)
```

Never let an error escape without a response; never respond twice.

## 2. First response decision

| Situation | Call |
|---|---|
| Fast (<1s), no state change risk | `reply` |
| Slow (DB/API/image/queue) | `deferReply` then edit |
| Button/select updating the same message | `update` or `deferUpdate` |
| Need user input | `showModal` (initial response only) |
| Autocomplete | respond with choices, always |

Defer **before** the first `await` that can be slow. Do not defer after fetching data.

## 3. Command types

- **Chat input (slash)**: options, subcommands, groups, autocomplete.
- **User context**: acts on a user; no options.
- **Message context**: acts on a message; no options.
- **Prefix/message commands** (optional): separate parsing; reuse the same action layer.

Design:

- One handler per command, thin: validate → call action/service → respond.
- Business logic lives outside transport code so prefix, slash, buttons, and API can share it.
- Permission metadata declared once and enforced centrally.
- Keep command payloads deterministic for registration diffs.

## 4. Options & validation

- Validate types, ranges and lengths **before** calling actions.
- Treat option values as untrusted input (strings, IDs, URLs, numbers).
- Resolve mentions/channel IDs robustly (`<@!id>`, `<#id>`, raw id).
- For numbers, check integer vs float, min/max, and NaN.
- For strings, enforce max length and reject control characters where relevant.
- Autocomplete: filter by focused option, cap at 25 choices, never leak private data.

## 5. Components & custom IDs

`custom_id` is your router key. It must be:

- 1–100 characters
- unique per message
- stable across restarts (do not encode random session state)
- parseable without ambiguity

Recommended schemes:

```
feature:action                     e.g. ticket:close
feature:action:resourceId          e.g. giveaway:claim:123456789012345678
module:action:resourceId:page      e.g. help:page:2
```

Avoid `_`-joined IDs when resource IDs or actions can contain `_`; use a delimiter that cannot
appear in the parts, or parse positionally with a fixed shape. Always validate the parsed shape.

Routing options:

| Pattern | Use when |
|---|---|
| Central router (`if id.startsWith(...)`) | Most bots; one place for permissions/errors |
| Per-message collectors | Temporary flows with a clear lifetime |
| Framework store/decorators | The framework already provides it |

Central router rules:

1. Namespace every feature (`vm_`, `ticket_`) to avoid collisions.
2. Check ownership/permission **inside** the handler; never trust the message author.
3. Re-fetch resource state from DB; the message may be old.
4. Handle missing/stale resources with a specific message and clean up rows.
5. Delete or disable the panel when the resource is gone.

Collectors:

- Always set `time`, `max`, and an `end` cleanup.
- Never create unbounded collectors on hot events.
- Prefer the router for persistent panels.

## 6. Modals

Current modal anatomy (2026):

- A modal is `custom_id` + `title` + `components`.
- **Label** (type 18) is the recommended wrapper for inputs: it associates a label/description
  with one component. Action Rows containing Text Inputs are **deprecated** in modals.
- Inputs that can live inside a Label: Text Input (type 4), String/User/Role/Mentionable/Channel
  Select (3, 5–8), File Upload (19), Radio Group (21), Checkbox Group (22), Checkbox (23 —
  added February 2026).
- **Text Display** (type 10) can be used in modals for static explanatory text.
- Modals cannot contain buttons, and cannot be sent as a follow-up — `showModal` must be the
  initial response.

Rules:

- Keep modals to a small number of top-level components (historically 5 — verify the current cap
  in the component reference before designing a long form).
- `custom_id` routes the submit; include the target resource ID, and validate its shape.
- Validate every field again server-side: required flags, min/max length, select ranges, file type.
- On error, respond with a specific message; do not silently drop the submission.
- If work after submit is slow, `deferReply` then `editReply` — the 3s window still applies.
- Prefill values are a convenience, never a trust boundary.

## 7. Pagination & navigation

- Encode page/state in the `custom_id` or a short server-side session key.
- Re-check that the clicker is allowed to view the page.
- Disable buttons at boundaries; remove stale buttons on resource deletion.
- Keep one message and edit it; do not send a new page message per click.

## 8. Error taxonomy (use specific messages)

| Failure | Message must say |
|---|---|
| Missing user permission | which permission, and where |
| Missing bot permission | permission + channel/role |
| Hierarchy | target role/channel is above the bot |
| Not found / stale | resource gone; run setup again |
| Ownership | only owner/admin can use this |
| Rate limited | try again in N seconds |
| Validation | expected format/range |
| Target not in guild | mention/ID not a member |
| Bot target | bots cannot be used here |
| Already done | idempotent no-op explanation |

## 9. Checklist

- [ ] Ack ≤3s on every path, including errors
- [ ] Defer before slow work; `editReply` after defer
- [ ] One response per interaction; no double reply
- [ ] `custom_id` namespaced, bounded, validated
- [ ] Permissions/ownership re-checked in the handler
- [ ] Stale resource cleanup on missing data
- [ ] Collectors have timeout + cleanup
- [ ] Errors are specific and correlated in logs
