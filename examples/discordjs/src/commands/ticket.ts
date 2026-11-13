import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { Database } from '../db/client.js';
import { buildCustomId } from '../interactions/customId.js';
import { UserError } from '../lib/errors.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Manage support tickets')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('Open a new support ticket')
      .addStringOption((opt) =>
        opt
          .setName('subject')
          .setDescription('Brief description of your issue')
          .setRequired(true)
          .setMaxLength(100),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('close')
      .setDescription('Close the current ticket')
      .addStringOption((opt) =>
        opt
          .setName('reason')
          .setDescription('Reason for closing')
          .setMaxLength(250),
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  db: Database,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'create') {
    // Ack immediately before slow work
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const subject = interaction.options.getString('subject', true);
    const guild = interaction.guild;
    if (!guild) throw new UserError('NO_GUILD', 'This command can only be used in a guild.');

    // Check bot permissions to manage channels
    const botMember = guild.members.me;
    if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
      throw new UserError('BOT_MISSING_PERMS', 'I need the "Manage Channels" permission to create ticket channels.');
    }

    const ticketId = `t-${Date.now().toString(36)}`;
    const channelName = `ticket-${interaction.user.username.slice(0, 15).toLowerCase()}-${ticketId}`;

    // Create private ticket channel
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: botMember.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ],
    });

    // Record in database
    await db.createTicket({
      id: ticketId,
      guildId: guild.id,
      channelId: channel.id,
      ownerId: interaction.user.id,
    });

    // Post control panel with buttons in the new channel
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildCustomId('ticket', 'claim', ticketId))
        .setLabel('Claim Ticket')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(buildCustomId('ticket', 'close', ticketId))
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger),
    );

    await channel.send({
      content: `### 🎫 Support Ticket: ${subject}\nOpened by <@${interaction.user.id}>.\nStaff can click **Claim** to take ownership or **Close** when resolved.`,
      components: [row],
    });

    await interaction.editReply({
      content: `Ticket created! Head over to <#${channel.id}>.`,
    });
    return;
  }

  if (subcommand === 'close') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const ticket = await db.getTicket(interaction.channelId);
    if (!ticket) {
      throw new UserError('NOT_A_TICKET', 'This channel is not an active ticket.');
    }

    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    await db.closeTicket(ticket.id, reason);

    await interaction.editReply({
      content: `Ticket closed. Reason: ${reason}. Channel will be archived or deleted by staff.`,
    });
  }
}
