import type { LogLevel } from '../config.js';

const WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEY = /token|secret|password|authorization|cookie|apikey|api_key/i;

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

/** Replace secret-looking values so tokens never reach log storage. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth]';
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack, code: (value as { code?: unknown }).code };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? '[redacted]' : redact(item, depth + 1);
    }
    return out;
  }
  return value;
}

/** Structured JSON logger: one line per record, machine-parseable. */
export function createLogger(
  level: LogLevel,
  bindings: Record<string, unknown> = {},
  sink: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Logger {
  const threshold = WEIGHT[level];
  const write = (recordLevel: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (WEIGHT[recordLevel] < threshold) return;
    sink(
      JSON.stringify({
        level: recordLevel,
        time: new Date().toISOString(),
        service: 'discord-bot',
        ...(redact(bindings) as Record<string, unknown>),
        message,
        ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
      }),
    );
  };

  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
    child: (extra) => createLogger(level, { ...bindings, ...extra }, sink),
  };
}
