# 03 â€” Messages, Embeds & Components V2

Primary sources:
- https://discord.com/developers/docs/resources/message
- https://discord.com/developers/docs/components/overview
- https://discord.com/developers/docs/components/reference
- https://discord.com/developers/docs/components/using-message-components
- https://discord.com/developers/docs/components/using-modal-components

## 1. Choose the presentation

| Need | Use |
|---|---|
| One or two lines, no structure | Plain message content |
| Structured fields, metadata, links | Embed |
| A few buttons/selects, legacy-safe | Classic action rows + embed |
| Rich layout, multiple sections, media, branded panels | Components V2 |
| User input | Modal (text inputs) |
| Temporary status | Ephemeral reply |

Do not mix CV2 with embeds/content in the same message: CV2 disables both.

## 2. Message baseline & Discord Markdown

- Content limit ~2,000 chars; keep messages short and paginate.
- Links: use masked links `[text](url)`; sanitize user-provided URLs.
- Files: expose attachments deliberately; do not assume embeds render them.
- Message flags:
  - `MessageFlags.SuppressNotifications` (`4096` / `1 << 12`): Silent message (`@silent`), sends without push/desktop notification or sound.
  - `MessageFlags.SuppressEmbeds` (`4` / `1 << 2`): Hides automatic link preview embeds generated from URLs in content.

### Markdown syntax cheat sheet

| Style | Syntax | Notes |
|---|---|---|
| Bold | `**text**` | Standard double asterisk |
| Italic | `*text*` or `_text_` | Single asterisk or underscore |
| Bold Italic | `***text***` | Triple asterisk |
| Underline | `__text__` | Double underscore (Discord-specific) |
| Strikethrough | `~~text~~` | Double tilde |
| Spoiler | `||text||` | Double pipe (click to reveal) |
| Underline Bold | `__**text**__` | Nested combinations allowed |
| Inline code | `` `code` `` | Single backtick |
| Code block | ```` ```lang ```` | Fenced with optional syntax highlighting |
| Single quote | `> text` | Space after `>` required |
| Multi-line quote | `>>> text` | Space after `>>>`; quotes everything until end of string |
| Subtext / small | `-# text` | Space after `-#` required; must be at start of line |
| Headers | `# H1`, `## H2`, `### H3` | Space after `#` required; must be at start of line |
| Bullet list | `- item` or `* item` | Space after bullet required; 2 spaces indent for child |

### Dynamic timestamps

Never format dates/times statically in bot responses; use Discord's native `<t:UNIX_SECONDS:FLAG>` so timestamps render in each user's local timezone and locale:

| Flag | Name | Output example |
|---|---|---|
| `t` | Short Time | `9:01 AM` |
| `T` | Long Time | `9:01:00 AM` |
| `d` | Short Date | `11/13/2026` |
| `D` | Long Date | `November 13, 2026` |
| `f` | Short Date/Time *(default)* | `November 13, 2026 9:01 AM` |
| `F` | Long Date/Time | `Friday, November 13, 2026 9:01 AM` |
| `R` | Relative Time | `2 minutes ago` / `in 5 minutes` |

Example: `<t:1773489600:R>` renders as relative countdown or elapsed time.

### Mentions & custom emoji syntax

| Entity | Syntax | Notes |
|---|---|---|
| User mention | `<@USER_ID>` | Pings user unless blocked by `allowed_mentions` |
| Channel mention | `<#CHANNEL_ID>` | Clickable channel link |
| Role mention | `<@&ROLE_ID>` | Mentions role |
| Static emoji | `<:name:EMOJI_ID>` | Custom guild emoji |
| Animated emoji | `<a:name:EMOJI_ID>` | Animated custom guild emoji (requires Nitro / bot perm) |

## 3. Embeds

Standard limits (verify current docs):

| Field | Limit |
|---|---|
| Embeds per message | 10 |
| Total characters across embeds | 6,000 |
| Title | 256 |
| Description | 4,096 |
| Fields | 25 |
| Field name / value | 256 / 1,024 |
| Footer text | 2,048 |
| Author name | 256 |

Rules:

- Truncate to limits before sending; a rejected payload is a bug, not an error to retry.
- One embed per concept; use fields for key/value data, not walls of text.
- Do not put essential info only in images; screen readers and previews miss it.
- Use a consistent color per semantic state (info/success/warn/error).
- Escape user content that could break markdown (`*`, `_`, backticks, `>`).
- Footer/thumbnail/banner: keep URLs stable; avoid signed URLs that expire.

## 4. Classic components (legacy-safe)

- 5 action rows max; 5 buttons per row; one select per row.
- `custom_id` 1â€“100 chars; button label â‰¤80; select options â‰¤25.
- Link buttons use `url`, not `custom_id`.
- Disable controls while an operation is in flight to prevent double clicks.
- Remove controls when the underlying resource is deleted.

Use classic components when the library lacks CV2 support or the layout is simple.

## 5. Components V2

Facts (verified against the current component reference):

- Requires message flag `IS_COMPONENTS_V2` = `1 << 15` = **32768** (a *message* flag; the unrelated
  `MESSAGE_CONTENT` gateway intent also equals `1 << 15` â€” different namespace, do not confuse them).
- `content` and `embeds` no longer work; use Text Display / Container instead.
- Attachments are hidden unless exposed through a component (media gallery / file).
- `poll` and `stickers` are disabled. With the flag set, only components may be sent â€” sending
  `content`, `embeds`, `files`, or `poll` fails with `400 Bad Request`.
- Max **40 components** per message in total, counting nested children.
- The flag is **irreversible**: once a message is sent with it, it cannot be removed.
- Webhooks: application-owned webhooks can always send components. Other webhook executions need
  `?with_components=true`, and may only send non-interactive components. With the CV2 flag, a
  webhook message can contain only `components`.
- Library support varies by version; check installed declarations for builder names.

Component types (numeric values are stable; names are library-specific):

| Type | Component | Role | Where |
|---|---|---|---|
| 1 | Action Row | Layout | Message |
| 2 | Button | Interactive | Message |
| 3, 5â€“8 | String / User / Role / Mentionable / Channel Select | Interactive | Message, Modal |
| 4 | Text Input | Interactive | Modal |
| 9 | Section | Layout (text + accessory) | Message |
| 10 | Text Display | Content (markdown) | Message, Modal |
| 11 | Thumbnail | Content (accessory) | Message |
| 12 | Media Gallery | Content (image/video grid) | Message |
| 13 | File | Content (exposes an attachment) | Message |
| 14 | Separator | Layout (spacing) | Message |
| 17 | Container | Layout (grouping + accent color) | Message |
| 18 | Label | Layout (label + one input) | Modal |
| 19 | File Upload | Interactive | Modal |
| 21, 22, 23 | Radio Group / Checkbox Group / Checkbox | Interactive | Modal (added Feb 2026) |

Design rules:

1. One idea per container; avoid nested visual noise.
2. Accent color is limited; use it as brand accent, not on every element.
3. Keep total components well under 40 to leave room for future edits.
4. Do not rely on undocumented component types; feature-detect.
5. Test the exact payload with a real client; previews in code are not proof.

Fallback strategy:

- If CV2 unsupported: render the same information as embed + classic buttons.
- Centralize the builder so switching presentation does not touch command logic.
- Log when a fallback is used, so degraded UI is visible.

## 6. Panels (persistent UI)

Checklist for any panel (help, ticket, voice, giveaway, setup):

- [ ] Posted once; later state changes edit the same message
- [ ] `custom_id` encodes what the handler needs, validated on click
- [ ] Message ID persisted if it must survive restarts
- [ ] Ownership/permission checks on every interaction
- [ ] Stale resource â†’ clear message + DB cleanup
- [ ] Delete panel when its resource is deleted
- [ ] No unbounded collectors; central router preferred
- [ ] Buttons disabled during destructive operations
- [ ] Destructive action requires confirmation (Danger style)

Anti-pattern: posting a new panel for every event (join, purchase, page view). It floods channels
and leaves orphan messages. Prefer one editable message keyed by a stored ID.

## 7. Ephemeral vs public

| Use ephemeral | Use public |
|---|---|
| Errors, validation, permission failures | Success confirmations others may need |
| Personal settings, balances, private data | Panel updates intended for the channel |
| Setup wizards | Announcements |

- Ephemeral messages can disappear on client reload; do not make them the only record.
- Follow-ups can be ephemeral independently of the initial reply; be consistent.
- Never leak another user's data through a public edit of an ephemeral flow.

## 8. Localization & formatting

- Keep strings in translation files, not inline in handlers.
- Use per-guild locale with a fallback.
- Format numbers/dates with the user's locale where the library supports it.
- Use Discord timestamps for timezone independence.
- Avoid idioms and gendered language in global bots.

## 9. Checklist

- [ ] Presentation choice matches need (embed vs CV2 vs plain)
- [ ] All limits enforced before send
- [ ] User content escaped/sanitized
- [ ] CV2 flag/limits understood; fallback exists
- [ ] Panel lifecycle: one message, edit in place, cleanup
- [ ] Ephemeral/public choice deliberate
- [ ] Strings externalized where i18n exists
