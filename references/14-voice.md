# 14 — Voice & Audio

Primary sources:
- https://discord.com/developers/docs/topics/voice-connections
- https://discord.com/developers/docs/topics/gateway-events#voice-state-update
- https://discord.js.org/docs/packages/voice/main

Voice is a separate UDP + WebSocket stack from the gateway. It has its own state machine, its own
failure modes, and — since 2026 — a mandatory encryption layer.

## 1. DAVE / E2EE is mandatory

Discord has been migrating voice and video to **DAVE** (Discord Audio & Video End-to-End
Encryption) since September 2024. Per the official voice docs, **from March 1, 2026 all audio and
video in DMs, group DMs, voice channels, and Go Live is E2EE-only**. A voice feature that cannot
speak DAVE is broken, not "degraded".

What this means in practice:

- Use a library version that implements DAVE. Verify, do not assume:
  - `@discordjs/voice` 0.19.x ships `DAVESession` and `daveEncryption` (defaults to `true`);
    it depends on `@snazzah/davey`.
  - `discord.py[voice]` 2.7.x pulls `davey` as a voice extra.
  - Other libraries: check the release notes for a DAVE/E2EE implementation before shipping.
- Do **not** disable `daveEncryption` to "fix" connection problems. Diagnose the real cause
  (UDP, opus, permissions) instead.
- Log DAVE errors as their own category; a decryption failure is not a normal disconnect.

## 2. Connection lifecycle

```text
join request → signalling (WS) → connecting (UDP discovery + IP discovery)
             → ready (encryption mode + DAVE session) → playback / receive
             → disconnected (recoverable) → reconnect
             → destroyed (terminal; rejoin explicitly)
```

Rules:

- Wait for `ready` before playing. Playing early produces "voice connection not ready" errors.
- `disconnected` is often recoverable: try `connection.reconnect()`; if that fails, rejoin.
- `destroyed` is terminal. Remove the connection from your registry and rejoin on demand.
- One connection per guild per process. Reuse it; never stack `joinVoiceChannel` calls.
- Clear the connection and player on guild leave, channel delete, and shutdown.

## 3. Minimal playback (discord.js / @discordjs/voice)

```ts
import {
  joinVoiceChannel, createAudioPlayer, createAudioResource,
  AudioPlayerStatus, VoiceConnectionStatus, entersState, StreamType,
} from '@discordjs/voice';
import { createReadStream } from 'node:fs';

const connection = joinVoiceChannel({
  channelId, guildId,
  adapterCreator: guild.voiceAdapterCreator,
  selfDeaf: true,          // default is true; keep it true for playback-only bots
  selfMute: false,
});

const player = createAudioPlayer();
connection.subscribe(player);
connection.on(VoiceConnectionStatus.Disconnected, async () => {
  try {
    await Promise.race([
      entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
      entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
    ]);
  } catch {
    connection.destroy(); // rejoin later
  }
});

const resource = createAudioResource(createReadStream(file), { inputType: StreamType.Arbitrary });
player.play(resource);
await entersState(player, AudioPlayerStatus.Playing, 10_000);
```

- `selfDeaf: true` for playback; **`selfDeaf` must be `false` to receive audio**.
- `inputType` matters: `OggOpus`/`WebmOpus` can be passed through without transcoding; anything
  else (`Arbitrary`) needs ffmpeg.
- `prism-media` + `ffmpeg-static` handle non-Opus sources; an Opus engine (`@discordjs/opus` or
  `opusscript`) is required for encoding and for receive.

## 4. Receiving audio

```ts
connection.receiver.subscribe(userId, {
  end: { behavior: EndBehaviorType.AfterSilence, duration: 1_000 },
});
```

- Requires an Opus decoder and `selfDeaf: false`.
- Streams are per-user and unbounded if never consumed: always destroy them on end/timeout.
- Decode → voice activity → STT is CPU-heavy: move it to a worker, never the dispatch path.
- Do not record users without consent; see `08-security` and your local privacy rules.

## 5. State tracking

- `VOICE_STATE_UPDATE` is the source of truth for who is where (requires `GUILD_VOICE_STATES`).
- Track join/leave/move with debounce; mass moves produce event storms.
- Empty-channel timers: start on last human leave, cancel on join, never one timer per event.
- Store `channel_id` + `guild_id` in your DB if the bot must survive restarts; in-memory
  connections do not survive a deploy.
- Cap concurrent connections per process (memory and UDP sockets are finite).

## 6. Music-bot architecture

```text
search/resolve → queue item (id, url, title, duration, requester)
              → per-guild queue worker → resource → player → events → panel edit
```

- One queue per guild, persisted or reconstructable; never one global queue.
- Resolve URLs off the interaction path (defer first), then enqueue.
- Handle `AudioPlayerStatus.Idle` (track ended) as the trigger for the next item, and clear the
  queue on disconnect.
- Add per-user/guild cooldowns on search and skip; abuse is the norm for music bots.
- Do not download media you have no right to stream; respect platform terms and copyright.
- Panel updates go through one message edit (`11-ux-patterns`), not a new message per track.

## 7. Failure catalogue

| Symptom | Cause | Fix |
|---|---|---|
| `Voice connection not ready` | Played before `ready` | `entersState(connection, Ready, timeout)` |
| Connect hangs, no audio | UDP blocked (container/host firewall) | Allow outbound UDP; check host networking |
| Works locally, fails in Docker | Missing UDP ports / NAT | Host networking or documented UDP range |
| Cuts out, `1006`/abnormal close | Network loss, region change | Reconnect logic + rejoin on `Destroyed` |
| No audio received | `selfDeaf: true` or no decoder | Join undeafened, install Opus engine |
| Decryption errors | DAVE not implemented/disabled | Upgrade library, keep `daveEncryption` on |
| Crackling / robotic | Transcoding without enough CPU, wrong inputType | Worker thread, correct `StreamType`, monitor CPU |
| Player plays nothing | Resource ended, or no subscriber | Check `AudioPlayerStatus`, `connection.subscribe(player)` |
| Leaks after leave | Player/streams/timers not destroyed | Destroy connection + player in one teardown path |

## 8. Other libraries (verify the exact API in the installed version)

| Library | Voice entry point | DAVE |
|---|---|---|
| discord.js | `@discordjs/voice`: `joinVoiceChannel`, `createAudioPlayer` | Yes in 0.19.x |
| discord.py | `discord.VoiceClient`, `FFmpegPCMAudio`, `discord.py[voice]` | Yes via `davey` extra |
| JDA | `AudioSendHandler` / `AudioReceiveHandler`; LavaPlayer for streaming | Check JDA release notes |
| serenity | `songbird` crate (separate versioning) | Check songbird releases |
| discordeno | `@discordjs/voice` works with a gateway adapter | Via `@discordjs/voice` |

## 9. Checklist

- [ ] DAVE/E2EE supported by the installed library version (verified, not assumed)
- [ ] Connection state machine handled: ready, disconnected, destroyed
- [ ] Player and connection torn down on leave/shutdown (no orphans)
- [ ] Opus/ffmpeg dependencies present and reported at boot (`generateDependencyReport()`)
- [ ] `selfDeaf` set correctly for playback vs receive
- [ ] Per-guild queue, bounded concurrency, cooldowns
- [ ] Voice errors categorized (network vs DAVE vs opus) and alerted
