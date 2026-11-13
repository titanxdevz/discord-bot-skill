import {
  Client,
  Events,
  GatewayIntentBits,
  Options,
} from 'discord.js';
import { loadConfig, loadEnvFile } from './config.js';
import { Database } from './db/client.js';
import { RedisCache } from './cache/redis.js';
import { registerInteractionCreateEvent } from './events/interactionCreate.js';
import { registerReadyEvent } from './events/ready.js';
import { createLogger } from './lib/logger.js';

loadEnvFile();
const config = loadConfig();
const log = createLogger(config.logLevel);

const db = new Database(config.databaseUrl, log);
const redis = new RedisCache(config.redisUrl, log);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 50,
    PresenceManager: 0,
    ReactionManager: 0,
    GuildMemberManager: 100,
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: { interval: 300, lifetime: 1_800 },
  },
  allowedMentions: { parse: ['users'], repliedUser: false },
});

registerReadyEvent(client, log);
registerInteractionCreateEvent(client, db, log);

client.on(Events.Error, (error) => {
  log.error('discord-client-error', { error });
});

client.on(Events.Warn, (message) => {
  log.warn('discord-client-warning', { message });
});

async function bootstrap(): Promise<void> {
  try {
    await db.init();
    await redis.connect();
    await client.login(config.token);
    log.info('bot-started');
  } catch (err) {
    log.error('fatal-startup-error', { error: err });
    process.exit(1);
  }
}

// Graceful shutdown handling
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('shutdown-initiated', { signal });

  const timeout = setTimeout(() => {
    log.error('shutdown-timeout-exceeded-forcing-exit');
    process.exit(1);
  }, 10_000);

  try {
    client.destroy();
    log.info('discord-client-destroyed');

    await redis.close();
    await db.close();
    log.info('resources-closed-clean-exit');
    clearTimeout(timeout);
    process.exit(0);
  } catch (err) {
    log.error('error-during-shutdown', { error: err });
    clearTimeout(timeout);
    process.exit(1);
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

void bootstrap();
