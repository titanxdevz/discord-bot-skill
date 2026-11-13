import test from 'node:test';
import assert from 'node:assert/strict';
import * as pingCommand from '../src/commands/ping.js';
import * as ticketCommand from '../src/commands/ticket.js';

test('ping command definition is valid', () => {
  const json = pingCommand.data.toJSON();
  assert.equal(json.name, 'ping');
  assert.ok(json.description.length > 0);
});

test('ticket command has create and close subcommands', () => {
  const json = ticketCommand.data.toJSON();
  assert.equal(json.name, 'ticket');
  const subcommands = json.options?.filter((o: any) => o.type === 1);
  assert.equal(subcommands?.length, 2);
});
