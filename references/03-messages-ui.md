# 03 — Messages, Embeds & Components V2

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

## 2. Message baseline

- Content limit ~2,000 chars; keep messages short and paginate.
- Markdown: use code fences for code, `>` for quotes, `-#` for subtext (supported clients).
- Mention policy: prefer explicit allowed mentions; never allow `@everyone` by accident.
- Timestamps: `<t:unix:style>` (`R`, `f`, `F`, `d`, `t`) instead of manually formatting.
- Links: use masked links `[text](url)`; sanitize user-provided URLs.
- Files: expose attachments deliberately; do not assume embeds render them.

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
- `custom_id` 1–100 chars; button label ≤80; select options ≤25.
- Link buttons use `url`, not `custom_id`.
- Disable controls while an operation is in flight to prevent double clicks.
- Remove controls when the underlying resource is deleted.

Use classic components when the library lacks CV2 support or the layout is simple.

## 5. Components V2

Facts:

- Requires message flag `IS_COMPONENTS_V2` = `1 << 15` = **32768**.
- `content` and `embeds` no longer work; use Text Display / Container instead.
- Attachments are hidden unless exposed through a component (media gallery/file).
- `poll` and `stickers` are disabled.
- Max **40 components** per message.
- The flag is **irreversible**: once a message is sent with it, it cannot be removed.
- Webhook executions need `?with_components=true`, otherwise components are ignored.
- Library support varies by version; check installed declarations for builder names.

Component vocabulary (verify names in your library):

| Component | Purpose |
|---|---|
| Container | Grouped layout with accent color |
| Text Display | Markdown text block |
| Section | Text + accessory (thumbnail/button) |
| Separator | Spacing/divider |
| Media Gallery | Image/video grid |
| Thumbnail | Small image accessory |
| Action Row | Buttons/selects inside the layout |
| File | Expose an attachment |
| Label / text input | Modal-only input wrappers (newer API) |

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
- [ ] Stale resource → clear message + DB cleanup
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
