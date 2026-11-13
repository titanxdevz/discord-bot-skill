import { MessageFlags, ModalSubmitInteraction } from 'discord.js';
import type { Database } from '../db/client.js';
import type { ParsedCustomId } from './customId.js';
import { UserError } from '../lib/errors.js';

export async function handleModal(
  interaction: ModalSubmitInteraction,
  parsed: ParsedCustomId,
  db: Database,
): Promise<void> {
  const { feature, action, args } = parsed;
  const ticketId = args[0];

  if (feature !== 'ticket' || action !== 'modal_close' || !ticketId) {
    throw new UserError('INVALID_MODAL', 'Unrecognized modal submission.');
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const reason = interaction.fields.getTextInputValue('reason');
  const closed = await db.closeTicket(ticketId, reason);

  if (!closed) {
    throw new UserError('ALREADY_CLOSED', 'This ticket has already been closed.');
  }

  await interaction.editReply({
    content: `Ticket \`${ticketId}\` has been closed.\n**Reason:** ${reason}`,
  });

  if (interaction.channel && 'send' in interaction.channel) {
    await interaction.channel.send({
      content: `🔒 **Ticket Closed** by <@${interaction.user.id}>\n**Reason:** ${reason}`,
    });
  }
}
