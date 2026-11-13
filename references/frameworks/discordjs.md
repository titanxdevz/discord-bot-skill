# Adapter — discord.js (Node.js / TypeScript / Bun / Deno)

Applies to `discord.js` v14.x (verified against 14.28.x and `@discordjs/builders` 1.15).
Core rules live in `02-interactions`, `03-messages-ui`, `04-architecture`; this file is only
what is specific to this library.

## 1. Imports that bite

```ts
import {
  Client, GatewayIntentBits, Partials, Events, MessageFlags,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ContainerBuilder, TextDisplayBuilder, SectionBuilder, SeparatorBuilder,
  MediaGalleryBuilder, ThumbnailBuilder, FileBuilder,
} from 'discord.js';
```

- v14 enums are PascalCase and singular (`GatewayIntentBits.MessageContent`).
- Builders are namespaced per type; `MessageEmbed`/`MessageActionRow` do not exist in v14.
- `ephemeral: true` is deprecated in current v14 in favour of `flags: MessageFlags.Ephemeral`.
  Check the installed typings; both work but only one is future-proof.

## 2. Client bootstrap

```ts
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  partials: [Partials.Channel],
  // Bound the cache instead of trusting defaults:
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 50,
    PresenceManager: 0,
  }),
  allowedMentions: { parse: ['users'], repliedUser: false },
});
```

- Request only the intents the features need; `MessageContent` and `GuildMembers` are privileged.
- `client.on(Events.Error, ...)` and `client.on(Events.Warn, ...)` are separate from `ClientReady`.
- `client.login(token)` throws on invalid token / disallowed intents — let it fail fast.

## 3. Interaction entry point

```ts
client.on(Events.InteractionCreate, async (interaction) => {
  const started = Date.now();
  try {
    if (interaction.isChatInputCommand()) return await runCommand(interaction);
    if (interaction.isButton() || interaction.isAnySelectMenu()) return await routeComponent(interaction);
    if (interaction.isModalSubmit()) return await routeModal(interaction);
  } catch (err) {
    await respondWithError(interaction, err);
  } finally {
    log.debug({ id: interaction.id, ms: Date.now() - started });
  }
});
```

Guards:

```ts
async function respondWithError(i: Interaction, err: unknown) {
  const payload = { content: messageFor(err), flags: MessageFlags.Ephemeral };
  try {
    if (i.isRepliable()) {
      if (i.deferred || i.replied) await i.editReply(payload);
      else await i.reply(payload);
    }
  } catch (e) {
    // 10062 / 40060 land here: log, never rethrow
  }
}
```

- `interaction.deferred` / `interaction.replied` are the only safe ack state checks.
- `interaction.isRepliable()` is false for autocomplete — handle autocomplete separately.
- `DiscordAPIError.code` gives `10062`, `40060`, `50013` (missing permissions).

## 4. Commands

```ts
export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Ticket actions')
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub.setName('close').setDescription('Close this ticket')
      .addStringOption((o) => o.setName('reason').setDescription('Why').setMaxLength(200)));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await closeTicket({ guildId: interaction.guildId!, channelId: interaction.channelId, actorId: interaction.user.id });
  await interaction.editReply(result.message);
}
```

- `setDMPermission(false)` / `setContexts(...)` for guild-only commands.
- Permission metadata: `setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)` — advisory
  only, re-check in the handler.
- Register with `client.rest.put(Routes.applicationCommands(clientId), { body })` or a deploy script;
  never from every shard.

## 5. Components

```ts
const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder().setCustomId(`ticket:claim:${ticketId}`).setLabel('Claim').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId(`ticket:close:${ticketId}`).setLabel('Close').setStyle(ButtonStyle.Danger),
);
await interaction.reply({ components: [row], flags: MessageFlags.Ephemeral });
```

- After `deferReply`, use `editReply`; use `update` only for component interactions that edit the
  message (`await interaction.update({ components: [...] })`).
- To edit the message a button belongs to: `interaction.update(...)`; to reply privately:
  `interaction.reply({ ..., flags: MessageFlags.Ephemeral })`.
- Collectors: `message.createMessageComponentCollector({ time, max, idle })`; always handle `end`
  and remove components there. Prefer a central router for persistent panels.

## 6. Embeds

```ts
const embed = new EmbedBuilder()
  .setColor(0x5865f2)
  .setTitle(truncate(title, 256))
  .setDescription(truncate(body, 4096))
  .addFields(fields.slice(0, 25).map((f) => ({ name: truncate(f.name, 256), value: truncate(f.value, 1024), inline: f.inline })))
  .setFooter({ text: truncate(footer, 2048) });
```

`EmbedBuilder#addFields` throws on invalid shapes; truncate before, not in a `catch`.
Total embed character budget is 6,000 — enforce it in the builder helper.

## 7. Components V2

```ts
const container = new ContainerBuilder()
  .setAccentColor(0x5865f2)
  .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Ticket #0142'))
  .addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('Opened by <@123>'))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)),
  )
  .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
  .addActionRowComponents(row);

await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
```

- `MessageFlags.IsComponentsV2` == `1 << 15`. `content` and `embeds` are ignored — do not send them.
- The flag is irreversible per message; to change layout, delete and resend.
- Max 40 components per message; count nested children.
- Webhooks: `webhook.send({ components, flags })` may need `?with_components=true` when using raw
  webhook URLs.
- Typings gate feature availability: if `ContainerBuilder` is missing, the installed version is older;
  check `@discordjs/builders` version rather than inventing a class.

## 8. Low-level / large-scale options

| Need | Package |
|---|---|
| No cache, raw JSON, lowest memory | `@discordjs/core` + `@discordjs/ws` + `@discordjs/rest` |
| Shared rate-limit buckets across processes | `@discordjs/proxy` |
| Shard → queue → workers decoupling | `@discordjs/brokers` |
| Voice | `@discordjs/voice` |

`client.ws.on('RAW', (packet) => ...)` gives raw gateway payloads when a wrapper is too heavy, but
you lose the library's state handling — only do this deliberately.

## 9. Sharding & lifecycle

- Small bots: single `Client`.
- Medium: `ShardingManager` (`shardCount: 'auto'`, `totalShards: 'auto'`) with a shard file that
  creates one `Client` per process.
- Large / per-guild state: `discord-hybrid-sharding` (ClusterManager) or `@discordjs/brokers`.
- Register commands once, from the manager or a deploy script — not per shard.
- Graceful shutdown: stop intake, `await client.destroy()`, close DB/queue.

## 10. Pitfalls

- Replying twice: `reply` then `followUp` in the same handler. Guard with `deferred/replied`.
- Awaiting a slow DB call before the first ack → `10062`.
- `interaction.update()` on a deferred reply → error; `update` is for component/modal message edits.
- Unhandled rejection inside `client.on(...)` kills the process in modern Node — always try/catch.
- `Events.ClientReady` fires once per shard, but `InteractionCreate` fires for all shards in-process.
- `setMaxLength` on options is validation at the API layer, not a substitute for server-side checks.
- BigInt: keep IDs as strings in JSON/DB; `JSON.stringify` on a BigInt throws.
