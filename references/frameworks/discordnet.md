# Adapter — Discord.Net (C# / .NET)

Verified against Discord.Net 3.20.x. Components V2 is supported through `ComponentBuilderV2`.

## 1. Bootstrap

```csharp
var config = new DiscordSocketConfig
{
    GatewayIntents = GatewayIntents.Guilds | GatewayIntents.GuildMessages,
    MessageCacheSize = 100,
    LogLevel = LogSeverity.Info,
};

var client = new DiscordSocketClient(config);
client.Log += OnLogAsync;
client.Ready += OnReadyAsync;
client.SlashCommandExecuted += OnSlashAsync;
client.ButtonExecuted += OnButtonAsync;
client.SelectMenuExecuted += OnSelectAsync;
client.ModalSubmitted += OnModalAsync;

await client.LoginAsync(TokenType.Bot, token);
await client.StartAsync();
await Task.Delay(Timeout.Infinite);
```

- `DiscordSocketConfig` is where cache size and intents live; defaults are not right for production.
- `LoginAsync` validates the token; `StartAsync` returns before the gateway is ready — use `Ready`.
- Register handlers before `StartAsync`; missing a subscription silently drops that interaction type.
- Never block inside an event handler; Discord.Net runs them on the gateway thread unless configured
  otherwise (`InteractionServiceConfig.DefaultRunMode = RunMode.Async`).

## 2. Commands

Attribute-based with `InteractionService`:

```csharp
public class TicketModule : InteractionModuleBase<SocketInteractionContext>
{
    [SlashCommand("ticket-close", "Close this ticket")]
    public async Task CloseAsync([Summary("reason")] string? reason = null)
    {
        await DeferAsync(ephemeral: true);
        var result = await _tickets.CloseAsync(Context.Guild.Id, Context.Channel.Id, Context.User.Id, reason);
        await ModifyOriginalResponseAsync(m => m.Content = result.Message);
    }
}
```

Registration:

```csharp
var interactions = new InteractionService(client.Rest, new InteractionServiceConfig
{
    DefaultRunMode = RunMode.Async,
    UseCompiledLambda = true,
});

await interactions.AddModulesAsync(Assembly.GetEntryAssembly(), services);
client.InteractionCreated += async interaction =>
{
    var ctx = new SocketInteractionContext(client, interaction);
    await interactions.ExecuteCommandAsync(ctx, services);
};

await interactions.RegisterCommandsToGuildAsync(guildId, deleteMissing: true);   // dev
// await interactions.RegisterCommandsGloballyAsync(deleteMissing: true);         // prod
```

- `InteractionService` needs `client.Rest`; `AddModulesAsync` is required before executing.
- Register from one process only; `deleteMissing: true` removes stale commands.
- `RunMode.Async` keeps slow handlers off the gateway thread.
- Add `[RequireUserPermission(GuildPermission.ManageChannels)]` / `[RequireBotPermission(...)]`,
  but still check in the action layer.

## 3. Responding

| Need | Call |
|---|---|
| Immediate reply | `await RespondAsync("...", ephemeral: true)` |
| Slow work | `await DeferAsync(ephemeral: true)` then `ModifyOriginalResponseAsync` |
| Extra message | `await FollowupAsync(...)` |
| Edit the component's message | `await UpdateAsync(...)` (or `DeferAsync` + `UpdateAsync`) |
| Modal | `await RespondWithModalAsync(modal)` |

- `Context.Interaction` exposes the raw interaction when you need `Id`/`Token`.
- After `DeferAsync`, `RespondAsync` throws — the response path is `ModifyOriginalResponseAsync`.
- `UpdateAsync` is only valid for component/modal interactions.

## 4. Components

```csharp
var builder = new ComponentBuilder()
    .WithButton("Close", $"ticket:close:{ticketId}", ButtonStyle.Danger)
    .WithButton("Claim", $"ticket:claim:{ticketId}", ButtonStyle.Primary);

await RespondAsync("Ticket controls", components: builder.Build(), ephemeral: true);
```

- `customId` limit is 1–100 chars; `ButtonStyle` includes `Primary`, `Secondary`, `Success`,
  `Danger`, `Link`.
- Selects: `new SelectMenuBuilder().WithCustomId("help:select").AddOption("Label", "value", "desc")`.
- `[ComponentInteraction("ticket:close:*")]` supports wildcards; bind values via method parameters.
- `[ModalInteraction("ticket:modal")]` for submits; `[ModalInteraction("...:*")]` with parameters.
- Persistent views: custom IDs are stateless, so no re-registration needed — but re-fetch DB state.

## 5. Embeds

```csharp
var embed = new EmbedBuilder()
    .WithColor(new Color(0x58, 0x65, 0xF2))
    .WithTitle(Truncate(title, 256))
    .WithDescription(Truncate(body, 4096))
    .WithFooter(Truncate(footer, 2048))
    .Build();

await RespondAsync(embeds: new[] { embed });
```

- Discord.Net throws on over-limit values in some builders; truncate first regardless.
- `AllowedMentions.None` on the message unless pings are intended.

## 6. Components V2

```csharp
var builder = new ComponentBuilderV2()
    .WithTextDisplay("## Ticket #0142")
    .WithMediaGallery(new[] { attachmentUrl })
    .WithActionRow(new IMessageComponentBuilder[]
    {
        new ButtonBuilder("Close", $"ticket:close:{ticketId}").WithStyle(ButtonStyle.Danger),
    });

MessageComponent components = builder.Build();
await RespondAsync(components: components, ephemeral: true);
```

- `ComponentBuilderV2` lives in the `Discord` namespace; extension methods `WithTextDisplay`,
  `WithMediaGallery`, `WithActionRow` come from `ComponentContainerExtensions`.
- v2 disables `text`/`embeds` — send only components.
- The library sets the v2 flag when the payload contains v2 components; verify in the version you use.
- 40 components max; the flag is irreversible per message.
- Older 3.x versions before v2 support: fall back to `ComponentBuilder` + embeds.

## 7. Permissions

- `Context.Guild.CurrentUser.GuildPermissions` for the bot; `Context.Guild.GetUser(id)` for members.
- Channel-level: `Context.Channel.GetUserPermissionsAsync()` / `GetPermissionOverwrite`.
- Hierarchy: compare `Guild.GetUser(...).Hierarchy` and `Guild.CurrentUser.Hierarchy`; role position
  checks are separate from permission bits.
- `RequireUserPermission` attributes return a generic error; your own check gives a better message.

## 8. Sharding & lifecycle

- `new DiscordShardedClient(new DiscordSocketConfig { ... })`, subscribe to `ShardReady`.
- `client.Shards` exposes per-shard state; `TotalShards` comes from the recommended count.
- Register commands once from the sharded client, not from each shard.
- Shutdown: `await client.StopAsync(); await client.LogoutAsync();` then dispose services/DB pools.
- `client.SetGameAsync`/presence updates are rate-limited; don't do them per guild.

## 9. Pitfalls

- Forgetting `await interactions.AddModulesAsync(...)` → commands never execute.
- Using `RespondAsync` after `DeferAsync` → `InteractionAlreadyRespondedException`.
- `RunMode.Sync` (default) blocking the gateway on DB calls.
- `MessageCacheSize = 0` then relying on `Context.Message`/cached messages.
- Registering modules per shard → duplicate command registrations.
- Swallowing exceptions in `Task` handlers with `async void`.
- Using `Context.Client`/`Context.Guild` without null checks (DM interactions have no guild).
