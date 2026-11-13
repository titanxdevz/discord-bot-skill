import {
  DiscordAPIError,
  MessageFlags,
  type RepliableInteraction,
} from 'discord.js';
import type { Logger } from './logger.js';

/** An error whose message is safe to show to the user. */
export class UserError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'UserError';
    this.code = code;
  }
}

const API_HINTS: Record<number, string> = {
  10062: 'That interaction expired — try the command again.',
  40060: 'That interaction was already answered.',
  50013: 'I am missing a permission for that action.',
  50035: 'Discord rejected the payload (invalid component or option).',
};

export function isUnknownInteraction(error: unknown): boolean {
  return error instanceof DiscordAPIError && error.code === 10062;
}

/** Map any error to a short, actionable user-facing message. */
export function userMessage(error: unknown): string {
  if (error instanceof UserError) return error.message;
  if (error instanceof DiscordAPIError) {
    return API_HINTS[Number(error.code)] ?? `Discord rejected the request (code ${error.code}).`;
  }
  return 'Something went wrong on my side. The error has been logged.';
}

/**
 * Exactly one response path: reply if nothing was sent, edit if already
 * deferred/replied, and never throw from the error handler itself.
 */
export async function respondWithError(
  interaction: RepliableInteraction,
  error: unknown,
  log: Logger,
  correlationId: string,
): Promise<void> {
  const payload = { content: userMessage(error) };

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }
  } catch (replyError) {
    // 10062 / 40060 land here: the interaction is gone or already answered.
    log.warn('error-response-failed', { correlationId, error: replyError });
  }
}
