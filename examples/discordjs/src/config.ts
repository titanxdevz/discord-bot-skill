import { readFileSync } from 'node:fs';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Config {
  readonly token: string;
  readonly clientId: string;
  readonly devGuildId: string | null;
  readonly databaseUrl: string;
  readonly redisUrl: string | null;
  readonly logLevel: LogLevel;
  readonly shardCount: number | 'auto';
  readonly registerCommandsOnBoot: boolean;
}

const SNOWFLAKE = /^\d{17,20}$/;
const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** Minimal .env loader so the example has no dotenv dependency. */
export function loadEnvFile(path = '.env'): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return; // real environments set vars directly; a missing .env is not an error
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1];
    let value = match[2] ?? '';
    if (key === undefined) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function optional(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

/** Validate configuration once, at boot. Fail fast with a specific message. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = required(env, 'DISCORD_TOKEN');
  const clientId = required(env, 'DISCORD_CLIENT_ID');
  if (!SNOWFLAKE.test(clientId)) {
    throw new Error('DISCORD_CLIENT_ID must be a snowflake (17-20 digits)');
  }

  const devGuildId = optional(env, 'DISCORD_DEV_GUILD_ID');
  if (devGuildId !== null && !SNOWFLAKE.test(devGuildId)) {
    throw new Error('DISCORD_DEV_GUILD_ID must be a snowflake (17-20 digits)');
  }

  const logLevel = (optional(env, 'LOG_LEVEL') ?? 'info') as LogLevel;
  if (!LEVELS.includes(logLevel)) {
    throw new Error(`LOG_LEVEL must be one of ${LEVELS.join(', ')}`);
  }

  const rawShardCount = optional(env, 'SHARD_COUNT') ?? 'auto';
  const shardCount =
    rawShardCount === 'auto' ? 'auto' : Number.parseInt(rawShardCount, 10);
  if (shardCount !== 'auto' && (!Number.isInteger(shardCount) || shardCount < 1)) {
    throw new Error('SHARD_COUNT must be "auto" or a positive integer');
  }

  return Object.freeze({
    token,
    clientId,
    devGuildId,
    databaseUrl: required(env, 'DATABASE_URL'),
    redisUrl: optional(env, 'REDIS_URL'),
    logLevel,
    shardCount,
    registerCommandsOnBoot: (optional(env, 'REGISTER_COMMANDS_ON_BOOT') ?? 'false') === 'true',
  });
}
