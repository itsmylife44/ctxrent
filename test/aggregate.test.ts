import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';

test('audit --all walks every session under a root and reports totals', async () => {
  const result = await run(['audit', 'test/fixtures/claude-code', '--all'], nodeDeps);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /sessions 14/);
  assert.match(result.stdout, /coverage: \d+ sessions with usage, \d+ without/);
});

test('audit --all states how many sessions the totals are built from', async () => {
  const result = await run(['audit', 'test/fixtures/claude-code', '--all', '--json'], nodeDeps);
  const model = JSON.parse(result.stdout);

  assert.equal(model.sessions.length, 14);
  assert.equal(model.totals.measuredSessions + model.totals.unmeasuredSessions, 14);
  assert.ok(model.totals.rent > 0);
});

test('audit --all does not fail on a malformed file', async () => {
  const result = await run(['audit', 'test/fixtures', '--all'], nodeDeps);

  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.length > 0);
});

test('audit --all on an empty root fails with one diagnostic', async () => {
  const result = await run(['audit', 'test/fixtures/empty', '--all'], nodeDeps);

  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim().split('\n').length, 1);
});
