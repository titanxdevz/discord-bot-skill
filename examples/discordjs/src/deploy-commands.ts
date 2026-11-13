import { REST, Routes } from 'discord.js';
import * as pingCommand from './commands/ping.js';
import * as ticketCommand from './commands/ticket.js';
import { loadConfig, loadEnvFile } from './config.js';
import { createLogger } from './lib/logger.js';

loadEnvFile();
const config = loadConfig();
const log = createLogger(config.logLevel);

const commands = [pingCommand.data.toJSON(), ticketCommand.data.toJSON()];
const rest = new REST({ version: '10' }).setToken(config.token);

async function deploy(): Promise<void> {
  try {
    log.info('deploying-commands', {
      count: commands.length,
      guildId: config.devGuildId,
    });

    if (config.devGuildId) {
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.devGuildId),
        { body: commands },
      );
      log.info('guild-commands-deployed-successfully');
    } else {
      await rest.put(Routes.applicationCommands(config.clientId), {
        body: commands,
      });
      log.info('global-commands-deployed-successfully');
    }
  } catch (error) {
    log.error('command-deployment-failed', { error });
    process.exit(1);
  }
}

void deploy();
