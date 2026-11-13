import { ShardingManager } from 'discord.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig, loadEnvFile } from './config.js';
import { createLogger } from './lib/logger.js';

loadEnvFile();
const config = loadConfig();
const log = createLogger(config.logLevel);

const currentDir = dirname(fileURLToPath(import.meta.url));
const botEntry = join(currentDir, 'index.js');

const manager = new ShardingManager(botEntry, {
  token: config.token,
  totalShards: config.shardCount,
  respawn: true,
});

manager.on('shardCreate', (shard) => {
  log.info('shard-spawned', { shardId: shard.id });

  shard.on('ready', () => {
    log.info('shard-ready', { shardId: shard.id });
  });

  shard.on('disconnect', () => {
    log.warn('shard-disconnected', { shardId: shard.id });
  });

  shard.on('reconnecting', () => {
    log.info('shard-reconnecting', { shardId: shard.id });
  });

  shard.on('death', (process) => {
    const exitCode = 'exitCode' in process ? process.exitCode : null;
    log.error('shard-died', { shardId: shard.id, exitCode });
  });
});

async function start(): Promise<void> {
  try {
    log.info('spawning-shards', { count: config.shardCount });
    await manager.spawn();
  } catch (error) {
    log.error('sharding-manager-failed', { error });
    process.exit(1);
  }
}

void start();
