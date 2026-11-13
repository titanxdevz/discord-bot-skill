import {
  ActionRowBuilder,
  ButtonInteraction,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { Database } from '../db/client.js';
import { buildCustomId, type ParsedCustomId } from './customId.js';
import { UserError } from '../lib/errors.js';

export async function handleButton(
  interaction: ButtonInteraction,
  parsed: ParsedCustomId,
  db: Database,
): Promise<void> {
  const { feature, action, args } = parsed;
  const ticketId = args[0];

  if (feature !== 'ticket' || !ticketId) {
    throw new UserError('INVALID_ACTION', 'Unrecognized button action.');
  }

  if (action === 'claim') {
    // Ack quickly
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const updated = await db.claimTicket(ticketId, interaction.user.id);
    if (!updated) {
      throw new UserError('TICKET_NOT_OPEN', 'This ticket is already claimed or closed.');
    }

    await interaction.editReply({
      content: `You have successfully claimed ticket \`${ticketId}\`!`,
    });

    if (interaction.channel && 'send' in interaction.channel) {
      await interaction.channel.send({
        content: `📌 <@${interaction.user.id}> has claimed this ticket.`,
      });
    }
    return;
  }

  if (action === 'close') {
    // Modal MUST be an initial response (cannot deferReply before showModal)
    const modal = new ModalBuilder()
      .setCustomId(buildCustomId('ticket', 'modal_close', ticketId))
      .setTitle('Close Support Ticket');

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason for closing')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Resolved issue, duplicate ticket, etc.')
      .setRequired(true)
      .setMaxLength(300);

    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
    return;
  }

  throw new UserError('UNKNOWN_BUTTON', `Unknown ticket action: ${action}`);
}
