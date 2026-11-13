import test from 'node:test';
import assert from 'node:assert/strict';
import { UserError, userMessage } from '../src/lib/errors.js';

test('userMessage surfaces UserError messages directly', () => {
  const err = new UserError('NO_PERM', 'You cannot perform this action.');
  assert.equal(userMessage(err), 'You cannot perform this action.');
});

test('userMessage obscures raw unexpected internal errors', () => {
  const err = new Error('Database connection failed at postgres://...');
  assert.equal(
    userMessage(err),
    'Something went wrong on my side. The error has been logged.',
  );
});
