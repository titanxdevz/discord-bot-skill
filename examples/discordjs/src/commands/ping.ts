import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Replies with WebSocket heartbeat and API round-trip latency');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sent = await interaction.reply({
    content: 'Pinging...',
    flags: MessageFlags.Ephemeral,
    fetchReply: true,
  });

  const roundTrip = sent.createdTimestamp - interaction.createdTimestamp;
  const wsPing = interaction.client.ws.ping;

  await interaction.editReply({
    content: `🏓 **Pong!**\n• Gateway Heartbeat: \`${wsPing}ms\`\n• Round-trip Latency: \`${roundTrip}ms\``,
  });
}
