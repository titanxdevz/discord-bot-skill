import { Client, Events } from 'discord.js';
import type { Logger } from '../lib/logger.js';

export function registerReadyEvent(client: Client, log: Logger): void {
  // ClientReady is the one-time event; do not re-run on RESUMED
  client.once(Events.ClientReady, (readyClient) => {
    log.info('bot-ready', {
      tag: readyClient.user.tag,
      id: readyClient.user.id,
      guildCount: readyClient.guilds.cache.size,
      shardId: readyClient.shard?.ids ?? [0],
    });
  });
}
