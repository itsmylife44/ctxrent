import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';

const fixture = 'test/fixtures/claude-code/minimal';

test('audit reports turns and total tokens for a session directory', async () => {
  const result = await run(['audit', fixture], nodeDeps);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /2 turns/);
  assert.match(result.stdout, /852 tokens/);
});

test('audit counts a repeated message id once', async () => {
  const result = await run(['audit', fixture, '--json'], nodeDeps);
  const model = JSON.parse(result.stdout);

  // A naive sum over 3 assistant records yields 1174; the duplicated id must not count twice.
  assert.equal(model.sessions[0].turns, 2);
  assert.equal(model.sessions[0].tokens.total, 852);
});

test('audit --json returns the session model', async () => {
  const result = await run(['audit', fixture, '--json'], nodeDeps);

  assert.equal(result.exitCode, 0);
  const model = JSON.parse(result.stdout);
  assert.equal(model.sessions.length, 1);
  assert.equal(model.sessions[0].sessionId, 'fixture-minimal');
  assert.equal(model.sessions[0].adapter, 'claude-code');
  assert.equal(model.sessions[0].turns, 2);
  assert.deepEqual(model.sessions[0].tokens, {
    input: 7,
    cacheRead: 600,
    cacheCreation: 200,
    output: 45,
    total: 852,
  });
  assert.equal(model.totals.turns, 2);
  assert.equal(model.totals.tokens.total, 852);
  assert.equal(model.totals.measuredSessions, 1);
  assert.equal(model.totals.unmeasuredSessions, 0);
});

test('audit exits non-zero with one diagnostic when there is no session', async () => {
  const result = await run(['audit', 'test/fixtures/empty'], nodeDeps);

  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim().split('\n').length, 1);
  assert.match(result.stderr, /no sessions/i);
});

test('audit exits non-zero when nothing in the sessions can be read', async () => {
  const result = await run(['audit', 'test/fixtures/garbage'], nodeDeps);

  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /no readable sessions/i);
});

test('audit rejects an unknown flag instead of ignoring it', async () => {
  const result = await run(['audit', fixture, '--bogus'], nodeDeps);

  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /unknown option "--bogus"/i);
});

test('a session without usage reports its tokens as unavailable, not zero', async () => {
  const result = await run(['audit', 'test/fixtures/claude-code/no-usage', '--json'], nodeDeps);

  assert.equal(result.exitCode, 0);
  const model = JSON.parse(result.stdout);
  assert.equal(model.sessions[0].turns, 1);
  assert.equal(model.sessions[0].tokens, null);
  assert.equal(model.totals.unmeasuredSessions, 1);
  assert.match(result.stdout, /"tokens": null/);
});
