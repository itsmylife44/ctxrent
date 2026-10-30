import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';

test('findings --json hands the agent evidence, not advice', async () => {
  const result = await run(
    ['findings', 'test/fixtures/claude-code', '--min-sessions', '1', '--json'],
    nodeDeps,
  );

  assert.equal(result.exitCode, 0);
  const body = JSON.parse(result.stdout);
  const finding = body.findings[0];

  assert.ok(typeof finding.id === 'string');
  assert.ok(typeof finding.label === 'string');
  assert.ok(typeof finding.saving === 'number');
  assert.ok(finding.lever === 'instruction' || finding.lever === 'configuration');
  assert.equal('advice' in finding, false);
});

test('findings prints a readable form too', async () => {
  const result = await run(['findings', 'test/fixtures/claude-code', '--min-sessions', '1'], nodeDeps);

  assert.match(result.stdout, /findings/);
  assert.match(result.stdout, /observed:/);
  assert.match(result.stdout, /example:/);
});

test('skill prints the protocol an agent needs', async () => {
  const result = await run(['skill'], nodeDeps);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /ctxrent findings --json/);
  assert.match(result.stdout, /ctxrent review --rules \.ctxrent\/rules\.md/);
  assert.match(result.stdout, /<!-- id: <finding id> -->/);
});
