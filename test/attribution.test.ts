import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';

async function session(fixture: string) {
  const result = await run(['audit', fixture, '--json'], nodeDeps);
  assert.equal(result.exitCode, 0);
  return JSON.parse(result.stdout).sessions[0];
}

test('rent is attributed to the skill and mcp tool that produced the turn', async () => {
  const parsed = await session('test/fixtures/claude-code/attribution');

  assert.deepEqual(parsed.skills, [
    { name: 'tdd', kind: 'skill', rent: 200 },
    { name: 'shopify', kind: 'mcp-tool', rent: 200 },
  ]);
});

test('attribution that the record does not carry is unavailable, not zero', async () => {
  const parsed = await session('test/fixtures/claude-code/waste');

  assert.equal(parsed.skills, null);
});
