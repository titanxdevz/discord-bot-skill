# Adapter — interactions.py + hikari (Python)

Two independent Python libraries with different philosophies. Pick one per project; do not mix
frameworks inside one bot.

- **interactions.py** 5.16.x — batteries-included: decorators, contexts, component callbacks,
  v2 components, automatic v2 flag.
- **hikari** 2.7.x — typed, async-first API wrapper; commands usually via **lightbulb** 3.x.

---

## Part A — interactions.py

### A1. Bootstrap

```python
import interactions

client = interactions.Client(
    token=TOKEN,
    intents=interactions.Intents.DEFAULT | interactions.Intents.GUILD_MEMBERS,
    auto_defer=interactions.AutoDefer(ephemeral=True),   # optional global safety net
    enforce_interaction_perms=True,
)
```

- `auto_defer` can mask slow handlers; prefer explicit `await ctx.defer()` and use auto-defer only
  as a backstop.
- `enforce_interaction_perms` defaults on; still validate permissions inside handlers.
- `delete_unused_application_cmds` removes stale commands — use with care in production.

### A2. Commands & components

```python
@interactions.slash_command(name="ticket-close", description="Close this ticket")
async def close(ctx: interactions.SlashContext, reason: str | None = None) -> None:
    await ctx.defer(ephemeral=True)
    result = await tickets.close(ctx.guild_id, ctx.channel_id, ctx.author.id, reason)
    await ctx.edit(content=result.message)     # edits the deferred original

@interactions.component_callback("ticket:close")
async def on_close(ctx: interactions.ComponentContext) -> None:
    ...
```

- `@interactions.slash_command`, `@interactions.user_command`, `@interactions.message_command`,
  `@interactions.modal_callback`, `@interactions.component_callback`, `@interactions.autocomplete`.
- `component_callback` matches the **prefix** of a custom ID; the remainder is available on
  `ctx.custom_id` / the callback's extra args. Keep IDs namespaced and parse defensively.
- `ctx.defer(ephemeral=True)`, `ctx.send(...)`, `ctx.edit(...)`, `ctx.delete()`.
- Component contexts expose `ctx.component`, `ctx.message`, `ctx.custom_id`.
- Modals: `interactions.Modal(...)` + `interactions.TextInput(...)`; respond with
  `await ctx.send_modal(modal)` **as the initial response**.

### A3. Components V2

```python
container = interactions.ContainerComponent(
    interactions.TextDisplayComponent("## Ticket #0142"),
    interactions.SectionComponent(
        components=[interactions.TextDisplayComponent("Opened by <@123>")],
        accessory=interactions.ThumbnailComponent(avatar_url),
    ),
    interactions.SeparatorComponent(divider=True),
    interactions.ActionRow(interactions.Button(
        style=interactions.ButtonStyle.DANGER,
        label="Close",
        custom_id="ticket:close",
    )),
    accent_color=0x5865F2,
)

await ctx.send(components=[container])
```

- interactions.py **sets `IS_COMPONENTS_V2` automatically** when any v2 component is present, and
  raises `ValueError` if you also pass `content` or `embeds`.
- Type numbers and limits are handled by the library; still keep total components ≤40.
- `SectionComponent` takes `components=` and a required `accessory=`.
- Older 5.x versions without these classes: fall back to embeds + `ActionRow`.

### A4. Embeds

```python
embed = interactions.Embed(
    title=title[:256],
    description=body[:4096],
    color=0x5865F2,
)
embed.add_field(name=name[:256], value=value[:1024], inline=inline)
await ctx.send(embeds=embed)
```

- `interactions.Embed` is a dict-backed model; validate before send.
- Set `allowed_mentions` explicitly for untrusted content.

### A5. Pitfalls

- Using `ctx.send` after deferring without editing the original → duplicate message.
- `component_callback` prefix collisions (`ticket:close` matches `ticket:close:all`); order
  callbacks from most specific to least.
- Blocking calls in handlers; use `asyncio.to_thread`.
- Forgetting to await `client.astart()` / awaiting `client.start()` incorrectly.
- Assuming `ctx.guild_id` is set in DMs.

---

## Part B — hikari (+ lightbulb)

### B1. Bootstrap

```python
import hikari
import lightbulb

bot = hikari.GatewayBot(
    TOKEN,
    intents=hikari.Intents.GUILDS | hikari.Intents.GUILD_MESSAGES,
)
client = lightbulb.client_from_app(bot)
bot.subscribe(hikari.StartingEvent, client.start)
bot.run()
```

- `hikari.GatewayBot` is the app; lightbulb attaches to it and must be started on `StartingEvent`.
- Intents are the same bitfield as Discord; privileged ones must be enabled in the portal.
- Hikari models are typed and frozen; build new objects instead of mutating.

### B2. Commands (lightbulb 3.x)

```python
@client.register()
class Close(
    lightbulb.SlashCommand,
    name="ticket-close",
    description="Close this ticket",
):
    reason: str = lightbulb.string("reason", "Why", default=None)

    @lightbulb.invoke
    async def invoke(self, ctx: lightbulb.Context) -> None:
        await ctx.defer(ephemeral=True)
        result = await tickets.close(ctx.guild_id, ctx.channel_id, ctx.user.id, self.reason)
        await ctx.edit_response(result.message)
```

- Lightbulb 3 uses class-based commands and `client.register()`; lightbulb 2 (`BotApp`,
  `@bot.command`) is a different API — check the installed version.
- `ctx.respond(...)`, `ctx.defer(...)`, `ctx.edit_response(...)`, `ctx.delete_response(...)`.
- Register slash commands with the client's sync helper or lightbulb's command registration API.

### B3. Raw hikari interaction handling

```python
@bot.listen(hikari.InteractionCreateEvent)
async def on_interaction(event: hikari.InteractionCreateEvent) -> None:
    interaction = event.interaction
    if isinstance(interaction, hikari.ComponentInteraction):
        if interaction.custom_id.startswith("ticket:close"):
            await interaction.create_initial_response(
                hikari.ResponseType.DEFERRED_MESSAGE_UPDATE
            )
            ...
```

- `create_initial_response` is the ack; `edit_initial_response` / `create_followup` afterwards.
- `ResponseType.DEFERRED_MESSAGE_UPDATE` for component edits, `DEFERRED_MESSAGE_CREATE` for replies.
- Wrap handlers: hikari logs listener exceptions but the interaction still times out for the user.

### B4. Components & CV2

```python
row = bot.rest.build_message_action_row().add_component(
    hikari.impl.InteractiveButtonBuilder(
        style=hikari.ButtonStyle.DANGER, custom_id="ticket:close"
    ).set_label("Close")
)

await bot.rest.create_message(channel_id, components=[row])

container = (
    hikari.impl.ContainerComponentBuilder(accent_color=0x5865F2)
    .add_component(hikari.impl.TextDisplayComponentBuilder(content="## Ticket #0142"))
    .add_action_row(row)
)
await bot.rest.create_message(
    channel_id,
    components=[container],
    flags=hikari.MessageFlag.IS_COMPONENTS_V2,   # required: hikari does not set it for you
)
```

- Hikari 2.7 exposes v2 builders in `hikari.impl`: `ContainerComponentBuilder`,
  `TextDisplayComponentBuilder`, `SectionComponentBuilder`, `ThumbnailComponentBuilder`,
  `MediaGalleryComponentBuilder`, `SeparatorComponentBuilder`, `FileComponentBuilder`.
- **You must pass `MessageFlag.IS_COMPONENTS_V2`** explicitly for messages and interaction
  responses; without it the components are rejected/ignored.
- Do not send `content`/`embeds` alongside v2 — omit them.
- Older hikari versions lack these builders: use embeds + classic action rows.

### B5. Embeds

```python
embed = hikari.Embed(title=title[:256], description=body[:4096], colour=0x5865F2)
embed.add_field(name=name[:256], value=value[:1024], inline=inline)
await bot.rest.create_message(channel_id, embed=embed)
```

- `hikari.Embed` validates some limits; still truncate user content first.
- `hikari.Undefined` vs `None` matters for optional API fields — don't pass `None` where the API
  distinguishes "unset".

### B6. Pitfalls

- Mixing lightbulb and manual interaction handlers can double-respond to the same interaction.
- `flags` omitted on v2 messages → looks like components silently disappear.
- Registering listeners after `bot.run()` has started.
- Cache assumptions: hikari's cache is opt-in per resource; fetch when unsure.
- `bot.close()` in a `finally`; otherwise the process can hang on shutdown.
