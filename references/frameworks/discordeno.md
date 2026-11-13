# Adapter — Discordeno (Node.js / Deno / Bun)

Verified against `@discordeno/bot` 21.x. Discordeno is deliberately low-level: it gives you
transformers, a REST manager and a gateway, and expects you to build commands and routing yourself.

## 1. Bootstrap

```ts
import { createBot, Intents, MessageComponentTypes } from '@discordeno/bot';

export const bot = createBot({
  token: process.env.DISCORD_TOKEN!,
  applicationId: process.env.DISCORD_APPLICATION_ID!,
  intents: Intents.Guilds | Intents.GuildMessages | Intents.MessageContent,
  events: {
    ready: () => console.log('ready'),
    interactionCreate: async (interaction) => { /* route */ },
  },
  desiredProperties: {
    interaction: { data: true, member: true, channel: true },
    message: { id: true, channelId: true, author: true, content: true },
  },
});
```

- `desiredProperties` is the memory lever: omitted fields are never transformed or stored. Turning
  everything on defeats the point.
- `bot.rest` is the raw REST manager; `bot.helpers` adds convenience wrappers on top.
- `bot.gateway` owns the WebSocket; `bot.events` are plain callbacks, and a thrown error is yours
  to catch — wrap every handler.
- Start with `await bot.start()`; stop with `await bot.shutdown()`.

## 2. Commands (manual by design)

```ts
const commands = [{
  name: 'ping',
  description: 'Latency',
  type: 1,
}];

await bot.rest.upsertGlobalApplicationCommands(commands);
```

- Discordeno has no command framework; keep a registry keyed by `name` and optional `name:sub`.
- Parse options with `commandOptionsParser(interaction)` from `@discordeno/bot`, or walk
  `interaction.data.options` yourself — always default missing values explicitly.
- Register once from a deploy script; the same payload shape as Discord's API (raw JSON).
- `upsertGuildApplicationCommands(guildId, commands)` for development.

## 3. Responding

```ts
await bot.rest.sendInteractionResponse(interaction.id, interaction.token, {
  type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
  data: { content: 'pong', flags: 64 }, // 64 = ephemeral
});

// after defer (type 5):
await bot.rest.editOriginalInteractionResponse(interaction.token, { content: 'done' });
```

- Times: 3s for the initial response, 15 minutes for edits/follow-ups — same as any library.
- `type` values: 4 reply, 5 deferred channel message, 6 deferred update, 7 update message,
  8 autocomplete, 9 modal.
- `type: 5` then `editOriginalInteractionResponse`; do not send a second `type: 4`.
- `bot.rest.sendMessage(channelId, body)` for channel messages, `editMessage`, `deleteMessage`.
- Errors surface as HTTP status + Discord `code` (`10062`, `40060`, `50013`); map them once.

## 4. Components

- Types come from `MessageComponentTypes` (`ActionRow`, `Button`, `StringSelect`, ...).
- Buttons: `{ type: 2, style: 1, label: 'Close', custom_id: 'ticket:close:42' }`.
- Action row: `{ type: 1, components: [button] }`.
- On `interactionCreate`, branch on `interaction.type` (2 = component, 3 = modal submit) and read
  `interaction.data.customId`.
- `bot.transformers` are available if you want typed component structures; otherwise raw objects
  are accepted by the REST manager.
- Persistent panels: store the message ID; edit via `bot.rest.editMessage`.

## 5. Components V2

Discordeno 21 does not model v2 components in its typings. Two options:

```ts
// Raw payload — works because REST takes plain JSON
await bot.rest.sendMessage(channelId, {
  flags: 1 << 15,
  components: [{
    type: 17, // container
    accent_color: 0x5865f2,
    components: [
      { type: 10, content: '## Ticket #0142' },
      { type: 1, components: [{ type: 2, style: 3, label: 'Close', custom_id: 'ticket:close:42' }] },
    ],
  }],
});
```

- Set the flag yourself; content/embeds are ignored with v2.
- Component type numbers (verify against current docs): 1 action row, 2 button, 3 string select,
  10 text display, 11 thumbnail, 12 media gallery, 13 file, 14 separator, 15 section, 17 container.
- 40 components max per message; the flag is irreversible.
- For interaction responses, the same body goes in `data` with the flag in `data.flags`.
- If v2 typings matter, wrap the raw payload in your own typed builder module.

## 6. Permissions

- `interaction.member?.permissions` is a bigint bitfield; use `hasPermission(perms, Permissions.ManageChannels)`-style
  helpers from `@discordeno/bot` rather than manual `&`.
- The bot's own permissions live on `bot.cache.guilds`/the guild object; do not assume.
- Compute channel overwrites yourself or fetch the channel and use its `permissionOverwrites`.

## 7. Sharding

```ts
const bot = createBot({
  token,
  applicationId,
  intents,
  gateway: {
    firstShardId: shardId,
    lastShardId: shardId,
    totalShards: totalShards,
  },
  events,
});
```

- One process per shard is the normal deployment; coordinate command registration and timers
  outside the shards.
- Use `bot.rest.getGatewayBot()` for the recommended shard count and `maxConcurrency`.
- Discordeno also supports `shardsPerWorker` for in-process grouping; keep it aligned with
  `maxConcurrency` so identify bursts stay under the limit.

## 8. Pitfalls

- No framework means no permission middleware by default — write it once and reuse it.
- Forgetting `await bot.start()` or awaiting it in a blocking way.
- BigInt snowflakes: keep them as strings at JSON/DB boundaries.
- `desiredProperties` too narrow → fields silently `undefined` (looks like a bug in Discord).
- Unhandled rejection in `bot.events.*` can take the process down; wrap and log.
- Command payloads are raw API shapes: there is no builder validation, so validate before upsert.
