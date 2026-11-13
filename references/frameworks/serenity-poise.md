# Adapter — serenity + poise (Rust)

Verified against serenity 0.12.x and poise 0.7.x. Rust gives stronger guarantees than most stacks,
but the interaction timing rules are identical.

## 1. Stack shape

- `serenity` — Discord API client: gateway, HTTP, cache, models, builders.
- `poise` — command framework on top: slash/prefix commands, argument parsing, error handling.
- Use poise for command-heavy bots; use serenity alone for event-driven services.
- Feature flags matter: `gateway`, `cache`, `rustls_backend` (or `native_tls_backend`), `voice`.

```toml
serenity = { version = "0.12", features = ["cache", "gateway", "rustls_backend"] }
poise = "0.7"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

## 2. Bootstrap (serenity only)

```rust
struct Handler;

#[serenity::async_trait]
impl serenity::all::EventHandler for Handler {
    async fn ready(&self, ctx: serenity::all::Context, ready: serenity::all::Ready) {
        println!("{} connected as {}", ctx.shard_id, ready.user.name);
    }

    async fn interaction_create(&self, ctx: serenity::all::Context, interaction: serenity::all::Interaction) {
        if let Err(err) = route(&ctx, &interaction).await {
            tracing::error!(?err, "interaction failed");
        }
    }
}

let intents = serenity::all::GatewayIntents::GUILDS;
let mut client = serenity::all::Client::builder(&token, intents)
    .event_handler(Handler)
    .await?;
client.start().await?;
```

- `Client::builder(...).await` can fail on invalid token/intents — surface it at boot.
- `client.start_autosharded().await` lets serenity fetch the recommended shard count.
- The cache is optional but required for member/guild lookups; tune it with `ClientBuilder::cache_settings`.
- Every handler runs on the runtime; a panic in one task can poison state — return `Result` and log.

## 3. poise framework

```rust
type Error = Box<dyn std::error::Error + Send + Sync>;
type Context<'a> = poise::Context<'a, Data, Error>;

struct Data { db: sqlx::PgPool }

#[poise::command(slash_command, guild_only)]
pub async fn ping(ctx: Context<'_>) -> Result<(), Error> {
    ctx.defer().await?;                 // ephemeral: ctx.defer_ephemeral()
    let ms = ctx.ping().await;
    ctx.say(format!("pong {ms:?}")).await?;
    Ok(())
}

let framework = poise::Framework::builder()
    .options(poise::FrameworkOptions {
        commands: vec![ping()],
        on_error: |err| Box::pin(async move { tracing::error!(?err, "framework error") }),
        ..Default::default()
    })
    .setup(|ctx, _ready, framework| {
        Box::pin(async move {
            poise::builtins::register_globally(ctx, &framework.options().commands).await?;
            Ok(Data { db: connect().await? })
        })
    })
    .build();

let mut client = serenity::all::Client::builder(&token, intents)
    .framework(framework)
    .await?;
client.start().await?;
```

- `setup` runs once per process — register commands here (or in a deploy binary), not per event.
- `on_error` is the single error boundary; map `FrameworkError` variants to user messages.
- Register in a guild during development: `poise::builtins::register_in_guild(...)`.
- `ctx.defer()` before slow work; `ctx.say()` and the returned `ReplyHandle` handle the response.
- `ctx.author()`, `ctx.guild_id()`, `ctx.channel_id()`, `ctx.id()` are the context accessors.

## 4. Components

```rust
use poise::serenity_prelude as serenity;

let row = serenity::all::CreateActionRow::Buttons(vec![
    serenity::all::CreateButton::new(format!("ticket:close:{id}"))
        .label("Close")
        .style(serenity::all::ButtonStyle::Danger),
]);

ctx.send(poise::CreateReply::default().components(vec![row])).await?;
```

- Handle clicks in `interaction_create`: match `Interaction::Component(component)`, read
  `component.data.custom_id`, then `component.defer(...)`/`create_response(...)`.
- `component.create_response(&ctx.http, CreateInteractionResponse::UpdateMessage(...))` edits the
  message; `DeferUpdate` then `edit_message` is the two-step version.
- Validate the `custom_id` shape and re-fetch the resource before acting.
- Modals: derive `poise::Modal` for typed fields and use the poise modal helpers for your context
  type; validate every field again on submit.

## 5. Embeds

```rust
let embed = serenity::all::CreateEmbed::new()
    .title(truncate(&title, 256))
    .description(truncate(&body, 4096))
    .field("Owner", format!("<@{owner}>"), true)
    .colour(0x5865f2);
```

- `CreateEmbed` does not truncate; enforce limits before building.
- `CreateAllowedMentions::new().empty()` unless pings are intended.
- Attachments: `CreateAttachment::bytes(...)`; do not hold large buffers longer than needed.

## 6. Components V2

Serenity 0.12 has **no** v2 component models or builders (verified: no `TextDisplay`/`Container`
types). Options:

1. Keep embeds + classic action rows (recommended for 0.12).
2. Send raw JSON with `reqwest` using the bot token for the few messages that need v2, and treat
   that module as a thin, tested adapter.
3. Wait for a serenity release that models v2, then migrate behind the same builder abstraction.

Do not invent serenity APIs for v2 components: the compiler is the source of truth.

## 7. Concurrency and data

- `tokio::spawn` for background work, but bound it (`tokio::sync::Semaphore`, `TaskTracker`).
- Per-guild ordering: `DashMap<GuildId, tokio::sync::Mutex<()>>` or a keyed queue.
- `sqlx`/`diesel` connection pools belong in `Data`, cloned via `Arc`.
- Never hold a `MutexGuard` across `.await` unless it is `tokio::sync::Mutex` and intentional.
- Shutdown: `client.shutdown().await`, then close pools; handle `tokio::signal::ctrl_c`.

## 8. Pitfalls

- Forgetting `guild_only` / DM checks: `ctx.guild_id()` is `Option`.
- `ctx.defer()` after a slow call → already past 3s.
- Registering commands inside `ready` on every reconnect → duplicate/rate-limit pain.
- `unwrap()`/`expect()` in handlers: one bad payload kills the task.
- Cache disabled but code assumes `ctx.cache.guild(...)` is present.
- Long blocking work (hashing, files) on the async runtime without `spawn_blocking`.
- Permissions: serenity exposes `Permissions` and `Member::permissions`; still compute channel
  overwrites via `GuildChannel::permissions_for(member)`.
