# Adapter — JDA (Java / Kotlin)

Verified against JDA 6.7.x. JDA 6 added Components V2; JDA 5.x has classic components only.
Check `net.dv8tion:JDA` in the build file before using any v2 class.

## 1. Bootstrap

```java
JDA jda = JDABuilder.createDefault(token)
    .enableIntents(GatewayIntent.GUILD_MESSAGES, GatewayIntent.MESSAGE_CONTENT)
    .addEventListeners(new BotListener())
    .setActivity(Activity.playing("tickets"))
    .build();
jda.awaitReady();
```

- `createDefault` enables the recommended cache; `createLight` disables it (lower memory, more fetches).
- `enableIntents(GatewayIntent.MESSAGE_CONTENT)` is privileged — enable it in the portal too.
- `.build()` returns immediately; use `.awaitReady()` (and handle `InterruptedException`) when you
  need the self user before proceeding.
- Register a global `IErrorHandler` via `.setErrorHandler(...)` or errors in `queue()` callbacks are
  only logged by JDA.

## 2. Events

```java
public final class BotListener extends ListenerAdapter {
    @Override public void onSlashCommandInteraction(SlashCommandInteractionEvent event) { ... }
    @Override public void onButtonInteraction(ButtonInteractionEvent event) { ... }
    @Override public void onStringSelectInteraction(StringSelectInteractionEvent event) { ... }
    @Override public void onModalInteraction(ModalInteractionEvent event) { ... }
}
```

- One `ListenerAdapter` per feature or one dispatcher; avoid anonymous listeners per command.
- Every handler body: try/catch → reply with a specific message → log with guild/user/command.
- JDA callbacks run on the JDA thread pool; blocking them stalls the gateway. Use `CompletableFuture`
  or an executor for slow work, or defer first.

## 3. Commands

```java
jda.updateCommands().addCommands(
    Commands.slash("ticket", "Ticket actions")
        .addSubcommands(new SubcommandData("close", "Close this ticket")
            .addOption(OptionType.STRING, "reason", "Why", false, true))
).queue();

public void onSlashCommandInteraction(SlashCommandInteractionEvent event) {
    if (!event.getName().equals("ticket")) return;
    event.deferReply(true).queue();                     // ephemeral
    actions.closeTicket(event.getGuild().getIdLong(), event.getChannel().getIdLong(), event.getUser().getIdLong())
        .thenAccept(result -> event.getHook().editOriginal(result.message()).queue());
}
```

- `deferReply(true)` = ephemeral; `getHook()` is the only valid response path afterwards.
- `event.reply(...).queue()` for fast paths; `.setEphemeral(true)` for private.
- Guild-scoped registration for development: `event.getGuild().updateCommands()...`.
- `Commands.slash(...).setDefaultPermissions(DefaultMemberPermissions.enabledFor(Permission.MANAGE_CHANNEL))`
  is a UI hint, not authorization.
- Option parsing: `event.getOption("reason")` returns `OptionMapping`; null-check optional options.

## 4. Components

```java
ActionRow row = ActionRow.of(
    Button.primary("ticket:claim:" + ticketId, "Claim"),
    Button.danger("ticket:close:" + ticketId, "Close")
);
event.reply("Ticket controls").setComponents(row).queue();

// On click:
event.deferEdit().queue();
event.getHook().editOriginalComponents(disabledRow).queue();
```

- `event.editComponents(...)` edits the message the component belongs to; `deferEdit()` avoids the
  3-second race when the edit is slow.
- Selects: `StringSelectMenu.create("help:select").addOption(label, value, description).build()`.
- Modals: `Modal.create("ticket:modal", "Open ticket").addComponents(...)`, reply with
  `event.replyModal(modal).queue()`. A modal is the initial response.
- `event.getMessage().getComponentTree()` (JDA 6) lets you replace/disable components safely.
- `custom_id` limits: 1–100 chars; keep the namespace and validate the parsed parts.

## 5. Embeds

```java
EmbedBuilder embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(truncate(title, 256))
    .setDescription(truncate(body, 4096))
    .setFooter(truncate(footer, 2048));
for (Field f : fields.subList(0, Math.min(fields.size(), 25))) {
    embed.addField(truncate(f.name(), 256), truncate(f.value(), 1024), f.inline());
}
event.replyEmbeds(embed.build()).queue();
```

- JDA does not truncate; over-limit values throw or get rejected.
- `setAllowedMentions(...)` on the message request unless pings are intended.

## 6. Components V2 (JDA 6)

```java
Container container = Container.of(
    TextDisplay.of("## Ticket #0142"),
    Section.of(
        Thumbnail.fromUrl(avatarUrl),
        TextDisplay.of("Opened by <@" + ownerId + ">"),
        TextDisplay.of("**Status:** open")
    ),
    Separator.createDivider(Separator.Spacing.SMALL),
    ActionRow.of(Button.danger("ticket:close:" + id, "Close"))
);

event.replyComponents(container)
     .useComponentsV2()          // required; sets the 1<<15 flag
     .setEphemeral(true)
     .queue();
```

- `useComponentsV2()` is mandatory on the request; without it the API rejects v2 components.
- v2 disables `content`/`embeds`; `replyComponents` is the right entry point.
- Max 40 components, `custom_id` 1–100, flag irreversible.
- Editing: `event.getHook().editOriginalComponents(container).useComponentsV2().queue()` — check the
  installed JDA signature; some edit requests expose v2 through the same `MessageEditRequest`.
- JDA 5.x has no v2 classes: use `EmbedBuilder` + `ActionRow`, or upgrade to JDA 6.

## 7. Permissions & hierarchy

```java
Member member = event.getMember();
if (member == null || !member.hasPermission(channel, Permission.MANAGE_CHANNEL)) { ... }
if (!event.getGuild().getSelfMember().canInteract(target)) { ... }
```

- `hasPermission(channel, ...)` includes overwrites; prefer it over `hasPermission(Permission...)`.
- `canInteract(member/role)` covers hierarchy; still catch `InsufficientPermissionException`.
- `PermissionException`/`ErrorResponseException` from JDA carry the HTTP status and Discord code.

## 8. Sharding & lifecycle

- One JDA instance per shard: `JDABuilder.createDefault(token).useSharding(shardId, shardTotal)`.
- For many shards, use `SessionController` or run one process per shard with a supervisor.
- Register commands from exactly one process; `jda.updateCommands()` is not shard-aware.
- Shutdown:

```java
jda.shutdown();
if (!jda.awaitShutdown(Duration.ofSeconds(10))) {
    jda.shutdownNow();
}
```

- Close DB pools and executors after the JDA shutdown call.

## 9. Pitfalls

- Blocking inside an event listener (JDBC, HTTP without timeout) → gateway lag and missed heartbeats.
- Forgetting `.queue()`: nothing is sent and no error is thrown.
- Ignoring the `ErrorResponseException` in the `queue(success, failure)` failure callback.
- Using `event.reply()` after `deferReply()` → `InteractionAlreadyRepliedException`.
- Holding `event.getGuild()` when the interaction came from a DM → null guild.
- `event.getMember()` null for webhook/DM contexts.
- Re-registering commands on every start → command rate limits.
- Assuming JDA 5 supports v2 components; it does not.
