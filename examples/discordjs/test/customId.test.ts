import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCustomId,
  parseCustomId,
  isSnowflake,
} from '../src/interactions/customId.js';

test('buildCustomId formats parts with colons', () => {
  const id = buildCustomId('ticket', 'claim', '12345');
  assert.equal(id, 'ticket:claim:12345');
});

test('buildCustomId rejects invalid characters', () => {
  assert.throws(
    () => buildCustomId('ticket', 'claim:invalid'),
    /Invalid custom_id part/,
  );
});

test('parseCustomId parses valid format correctly', () => {
  const parsed = parseCustomId('ticket:claim:12345');
  assert.deepEqual(parsed, {
    feature: 'ticket',
    action: 'claim',
    args: ['12345'],
  });
});

test('parseCustomId returns null on invalid or empty string', () => {
  assert.equal(parseCustomId(''), null);
  assert.equal(parseCustomId('singlepart'), null);
  assert.equal(parseCustomId('ticket:'), null);
});

test('isSnowflake identifies 17-20 digit strings', () => {
  assert.equal(isSnowflake('123456789012345678'), true);
  assert.equal(isSnowflake('short'), false);
  assert.equal(isSnowflake('1234567890123456789012345'), false);
});
