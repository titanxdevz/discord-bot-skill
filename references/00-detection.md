# 00 — Stack & Convention Detection

Do this before any code. The goal is a one-screen report, not a full audit. Ask the user only
when the answer changes the implementation (e.g. two apps in the repo, unclear deployment).
This skill stays current through the ecosystem's own sources.

## 1. Files that identify the stack

| Signal | Look at |
|---|---|
| Language/runtime | `package.json`, `tsconfig.json`, `pyproject.toml`, `requirements.txt`, `Pipfile`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle(.kts)`, `*.csproj`, `*.sln`, `deno.json` |
| Discord library | dependency list + lockfile (`bun.lock`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `poetry.lock`, `uv.lock`, `Cargo.lock`, `packages.lock.json`) |
| Version actually installed | lockfile entry or `node_modules/<pkg>/package.json`, `.venv/.../METADATA`, `Cargo.lock`, `~/.m2`; never trust `^`/`~` ranges |
| Entry point | `main`/`module` fields, `src/index.*`, `src/shard.*`, `bot.py`, `main.py`, `src/main.rs`, `Program.cs` |
| Handlers | folders named commands/events/interactions/components/listeners; loader files |
| Registration | `Routes.ApplicationCommands`, `command sync`, `deploy-commands`, `setup_hook`, startup logs |
| Persistence | SQLite files (`*.sqlite`, `*.db`, `*.bread`), ORM config, migration folders, Redis client |
| Queues/timers | BullMQ/Bee-Queue, Celery/RQ, cron, `setInterval`, APScheduler, Tokio tasks |
| Deployment | `Dockerfile`, `docker-compose.yml`, `Procfile`, `fly.toml`, `railway.json`, `k8s/`, PM2 config |
| Config | `.env`, `.env.example`, `config/*`, zod/pydantic/dotenv usage |

## 2. Detect library + version

Examples of what to grep:

- JS/TS: `discord.js`, `discordeno`, `@discordjs/rest`, `seyfert`, `@sapphire/framework`, `commandkit`
- Python: `discord.py`, `nextcord`, `disnake`, `interactions.py`, `hikari`, `pycord`
- Rust: `serenity`, `poise`, `twilight`
- Java/Kotlin: `JDA`, `discord4j`, `javacord`
- C#: `Discord.Net`, `DSharpPlus`
- Go: `discordgo`, `disgord`

Rules:

1. Installed version from the lockfile is the source of truth.
2. Read the installed package's type declarations for exact builder names. Builder names change
   between majors (e.g. `MessageEmbed` → `EmbedBuilder` in discord.js v14).
3. If the major version is unknown, inspect one real command file and mirror it instead of
   inventing an API.

## 3. Detect architecture

Answer these:

- **Commands**: slash only, prefix only, or both? One file per command or grouped subcommands?
- **Routing**: composite keys (`name,sub`), handler maps, decorators, framework stores?
- **Components**: custom-id format (`feature:action:id`), centralized router vs per-message collectors?
- **Events**: one listener per event file, or a bus? Any ordering assumptions?
- **Errors**: global handler, per-command try/catch, error embed helper?
- **i18n**: hardcoded strings or translation files? Per-guild locale?
- **Config**: env-only, DB-backed per-guild settings, or both? Cached?
- **State**: DB, in-memory Maps, Redis, files? Which is authoritative?
- **Sharding**: none, shard manager, cluster manager, worker threads?
- **Tests**: none, unit only, integration harness, snapshots?

## 4. Convention checklist (preserve these)

- File/folder naming and export shape
- Command metadata fields and permission declarations
- Response style (embed vs CV2 vs plain), colors, emoji, footer/watermark
- Error message style and ephemerality
- Logging format and logger instance
- DB repository pattern and migration style
- Import aliases / module resolution
- Formatter/linter/type settings

## 5. Risk scan (quick)

Flag, but do not fix yet:

- No interaction ack path or defer usage in slow commands
- `client.*` Maps used as ownership/state source
- Rate limits hardcoded or `sleep`-based throttling
- Sync I/O or heavy image work inside event handlers
- Missing permission checks on mutating commands
- Secrets in committed files
- SQLite shared across sharded processes
- Unbounded collectors/intervals without cleanup
- No graceful shutdown handling
- Tests absent for the area being changed

## 6. Output template

```
Stack:      <language> <version> / <library> <installed version>
Entry:      <file>            Registration: <mechanism>
Handlers:   <layout>          Routing: <keys/custom-id scheme>
Data:       <db/cache/queue>  Sharding: <none/manager/cluster>
Deploy:     <target>          Tests: <runner or none>
Preserve:   <3-6 conventions>
Risks:      <ordered short list>
Unknowns:   <what you could not detect>
```

## 7. Stop conditions

- Do not scaffold a second framework into an existing bot.
- Do not upgrade a major library version unless the user asked.
- Do not migrate databases as part of an unrelated fix.
- Do not assume the repo's deployment matches the code (check Dockerfile/PM2/CI).

Run `node scripts/audit.mjs <path>` for a deterministic first pass, then verify by reading code.
The script only flags candidates; it never proves correctness.
