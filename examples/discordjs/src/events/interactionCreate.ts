import { Client, Events, type Interaction } from 'discord.js';
import * as pingCommand from '../commands/ping.js';
import * as ticketCommand from '../commands/ticket.js';
import { handleButton } from '../interactions/buttons.js';
import { handleModal } from '../interactions/modals.js';
import { parseCustomId } from '../interactions/customId.js';
import { respondWithError, UserError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { Database } from '../db/client.js';

export function registerInteractionCreateEvent(
  client: Client,
  db: Database,
  log: Logger,
): void {
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    const correlationId = `${interaction.id}-${Date.now().toString(36)}`;
    const start = Date.now();

    try {
      if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        if (commandName === 'ping') {
          await pingCommand.execute(interaction);
        } else if (commandName === 'ticket') {
          await ticketCommand.execute(interaction, db);
        } else {
          throw new UserError('UNKNOWN_COMMAND', `Unknown command: ${commandName}`);
        }
        return;
      }

      if (interaction.isButton()) {
        const parsed = parseCustomId(interaction.customId);
        if (!parsed) {
          throw new UserError('BAD_CUSTOM_ID', 'Invalid interaction button identifier.');
        }
        await handleButton(interaction, parsed, db);
        return;
      }

      if (interaction.isModalSubmit()) {
        const parsed = parseCustomId(interaction.customId);
        if (!parsed) {
          throw new UserError('BAD_CUSTOM_ID', 'Invalid interaction modal identifier.');
        }
        await handleModal(interaction, parsed, db);
        return;
      }
    } catch (err) {
      log.error('interaction-execution-error', {
        correlationId,
        user: interaction.user.id,
        guild: interaction.guildId,
        error: err,
      });

      if (interaction.isRepliable()) {
        await respondWithError(interaction, err, log, correlationId);
      }
    } finally {
      log.debug('interaction-complete', {
        correlationId,
        durationMs: Date.now() - start,
      });
    }
  });
}
