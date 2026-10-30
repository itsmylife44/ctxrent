import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';
import { prescribe, instruction } from '../src/prescriptions.ts';

test('a recommendation carries an amount and ranks by it', async () => {
  const result = await run(['audit', 'test/fixtures/claude-code/shell-reads', '--json'], nodeDeps);
  const session = JSON.parse(result.stdout).sessions[0];
  const advice = prescribe({ claims: session.waste, carriers: session.carriers, rent: session.rent });

  assert.equal(advice[0]?.id, 'read-via-read-tool');
  assert.equal(advice[0]?.saving, 2400);
  assert.equal(advice[1]?.id, 'refetch-remote');
  assert.equal(advice[1]?.saving, 1500);
});

test('the advice is expressible as an instruction file line', async () => {
  const result = await run(['audit', 'test/fixtures/claude-code/shell-reads', '--json'], nodeDeps);
  const parsed = JSON.parse(result.stdout).sessions[0];
  const advice = prescribe({ claims: parsed.waste, carriers: parsed.carriers, rent: parsed.rent });

  assert.match(instruction(advice[0]!), /^- Read files with the Read tool/);
});

test('every claim that can be classified produces advice', async () => {
  const result = await run(['audit', 'test/fixtures/claude-code/waste', '--json'], nodeDeps);
  const session = JSON.parse(result.stdout).sessions[0];
  const advice = prescribe({ claims: session.waste, carriers: [], rent: session.rent }, 10);
  const covered = advice.reduce((sum, item) => sum + item.saving, 0);

  assert.equal(covered, session.wasteRent);
});

test('the terminal report shows what to change and why', async () => {
  const result = await run(['audit', 'test/fixtures/claude-code/shell-reads'], nodeDeps);

  assert.match(result.stdout, /what to change/);
  assert.match(result.stdout, /2,400 token-turns/);
  assert.match(result.stdout, /Read files with the Read tool/);
});

test('an always-on attachment is labelled apart from waste', async () => {
  const result = await run(['audit', 'test/fixtures/claude-code/always-on', '--json'], nodeDeps);
  const session = JSON.parse(result.stdout).sessions[0];
  const advice = prescribe({ claims: session.waste, carriers: session.carriers, rent: session.rent });

  assert.equal(advice[0]?.id, 'attachment-bloat');
  assert.equal(advice[0]?.basis, 'always-on');

  const text = await run(['audit', 'test/fixtures/claude-code/always-on'], nodeDeps);
  assert.match(text.stdout, /always-on, not counted as waste/);
});
