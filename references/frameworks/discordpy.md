# Adapter — discord.py (Python)

Verified against discord.py 2.7.x (Components V2 landed in 2.6.0). Core rules live in
`02-interactions` and `04-architecture`; this file is the Python-specific mapping.

## 1. Bootstrap

```python
import discord
from discord import app_commands
from discord.ext import commands

intents = discord.Intents.default()
intents.members = True            # privileged: enable in the portal
intents.message_content = True    # privileged: only if reading message text

class Bot(commands.Bot):
    def __init__(self) -> None:
        super().__init__(command_prefix="!", intents=intents)

    async def setup_hook(self) -> None:
        await self.load_extension("cogs.tickets")
        await self.tree.sync()          # dev: sync a guild for instant updates

bot = Bot()
bot.run(token)
```

- `Intents.default()` excludes members/message content; add only what the features require.
- `setup_hook` is the place for extensions, DB pools, and command sync — not `on_ready`.
- `on_ready` can fire more than once on reconnect; do not register or seed data there.
- `tree.sync()` on every start is rate-limit expensive at scale; gate it behind a payload hash.

## 2. Slash commands

```python
@app_commands.command(name="ticket-close", description="Close this ticket")
@app_commands.describe(reason="Why the ticket is being closed")
@app_commands.guild_only()
@app_commands.checks.has_permissions(manage_channels=True)
async def close(interaction: discord.Interaction, reason: str | None = None) -> None:
    await interaction.response.defer(ephemeral=True, thinking=True)
    result = await tickets.close(interaction.guild_id, interaction.channel_id, interaction.user.id, reason)
    await interaction.edit_original_response(content=result.message)
```

- `interaction.response.is_done()` tells you whether an ack happened.
- `defer()` must happen before slow awaits; `thinking=True` shows a loading state.
- `@app_commands.checks.*` is a convenience — re-check in the action layer.
- Prefix and slash commands can share an action function; keep the decorator thin.
- Autocomplete: `@app_commands.autocomplete(param=...)`, respond with ≤25 `Choice`s, no defer.

## 3. Views, buttons, selects

```python
class TicketView(discord.ui.View):
    def __init__(self, ticket_id: int) -> None:
        super().__init__(timeout=None)          # persistent across restarts
        self.ticket_id = ticket_id

    @discord.ui.button(label="Close", style=discord.ButtonStyle.danger, custom_id="ticket:close")
    async def close(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await interaction.response.defer()
        ...
```

- `timeout=None` + explicit `custom_id` makes a view persistent; you must **re-add** it after a
  restart (`bot.add_view(TicketView(...))`) or clicks fail with "interaction failed".
- A `View` instance cannot be reused across messages; build a new one per message (or a factory).
- `interaction.response.edit_message(...)` updates the message a component belongs to.
- Select menus: `discord.ui.Select` with `options=[discord.SelectOption(...)]`, `min_values`,
  `max_values`; validate the values again.
- Modals: `discord.ui.Modal` + `discord.ui.TextInput`; `await interaction.response.send_modal(modal)`.
  A modal is an initial response — you cannot reply first.
- `@discord.ui.button` callbacks must be defined on the class; dynamic routing needs
  `discord.ui.DynamicItem` (2.6+) or a central `on_interaction` router.

## 4. Components V2 (2.6+)

```python
class TicketPanel(discord.ui.LayoutView):
    def __init__(self, ticket) -> None:
        super().__init__(timeout=None)
        container = discord.ui.Container(accent_colour=discord.Colour.blurple())
        container.add_item(discord.ui.TextDisplay(f"## Ticket #{ticket.number}"))
        container.add_item(discord.ui.Section(
            discord.ui.TextDisplay(f"Opened by <@{ticket.owner_id}>"),
            accessory=discord.ui.Thumbnail(ticket.avatar_url),
        ))
        container.add_item(discord.ui.Separator())
        container.add_item(discord.ui.ActionRow(
            discord.ui.Button(label="Close", style=discord.ButtonStyle.danger, custom_id="ticket:close")
        ))
        self.add_item(container)
```

- `LayoutView` is required for v2 items; a plain `View` raises if you add v2 components.
- discord.py sets `IS_COMPONENTS_V2` automatically when the view contains v2 components
  (`View.has_components_v2()` → flag set in `http.py`). Do not set the flag by hand.
- Sending v2 with `content=` or `embeds=` raises — v2 replaces both.
- Available: `TextDisplay`, `Container`, `Section`, `Separator`, `Thumbnail`, `MediaGallery`,
  `File`, `ActionRow`. Names are `discord.ui.*`.
- `discord.ui.LayoutView.from_message(message)` reconstructs a layout for edits.
- Older 2.x versions lack these classes: check `discord.__version__` and fall back to embeds.

## 5. Embeds

```python
embed = discord.Embed(title=title[:256], description=body[:4096], colour=discord.Colour.blurple())
for field in fields[:25]:
    embed.add_field(name=field.name[:256], value=field.value[:1024], inline=field.inline)
embed.set_footer(text=footer[:2048])
```

- `discord.Embed.from_dict` for stored payloads; validate before send.
- `discord.utils.escape_markdown` / `escape_mentions` for untrusted text.
- `allowed_mentions=discord.AllowedMentions.none()` unless pings are intended.

## 6. Tasks and background work

```python
from discord.ext import tasks

@tasks.loop(minutes=1)
async def reap_expired() -> None:
    ...
```

- `tasks.loop` starts after `bot.wait_until_ready()`; guard against duplicate starts on reconnect.
- For durable jobs, use an external queue (Celery/RQ/arq) instead of an in-process loop.
- Blocking calls (`requests`, PIL, heavy IO) must go to `asyncio.to_thread` or a worker.

## 7. Sharding and lifecycle

- `commands.AutoShardedBot` for automatic shard count; `shard_ids`/`shard_count` to pin manually.
- Avoid `bot.run` inside an already-running event loop; use `await bot.start(token)`.
- Shutdown: `await bot.close()`, close DB pools, cancel tasks.
- `bot.tree.sync()` from one process only; use a deploy script or an env flag.

## 8. Pitfalls

- Missing `defer` before `await db...` → "The application did not respond".
- Calling `interaction.response.send_message` after defer → `InteractionResponded`.
- Editing with `interaction.edit_message` vs `edit_original_response` — different targets.
- Persistent views forgotten on restart → every old button fails.
- `discord.Intents.message_content` not enabled → `message.content` is empty, no error.
- `datetime.utcnow()` is naive; use timezone-aware UTC and Discord timestamps.
- `on_ready` doing setup work twice after a reconnect.
- Cogs loaded twice after a reload → duplicate command names and double handling.
