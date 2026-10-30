import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';

async function session(fixture: string) {
  const result = await run(['audit', fixture, '--json'], nodeDeps);
  assert.equal(result.exitCode, 0);
  return JSON.parse(result.stdout).sessions[0];
}

test('a codex session produces the same model as a claude code session', async () => {
  const parsed = await session('test/fixtures/codex/basic');

  assert.equal(parsed.adapter, 'codex');
  assert.equal(parsed.sessionId, 'fixture-codex');
  assert.equal(parsed.turns.length, 2);
  assert.deepEqual(
    parsed.turns[0].injections.map((i: { kind: string }) => i.kind),
    ['user-message', 'tool-result'],
  );
  assert.equal(parsed.turns[1].injections[0].kind, 'system');
  assert.equal(parsed.rent, 630);
  assert.equal(parsed.rentScore, null);
});

test('codex usage is mapped with cached tokens counted once', async () => {
  const parsed = await session('test/fixtures/codex/basic');

  assert.deepEqual(parsed.tokens, {
    input: 2200,
    cacheRead: 900,
    cacheCreation: 0,
    output: 110,
    total: 2310,
  });
});

test('codex sessions carry no attribution, which is reported as unavailable', async () => {
  const parsed = await session('test/fixtures/codex/basic');

  assert.equal(parsed.skills, null);
});

test('codex waste is unavailable rather than zero when no rule can judge the record', async () => {
  const parsed = await session('test/fixtures/codex/basic');

  assert.equal(parsed.wasteRent, null);
  assert.equal(parsed.rentScore, null);
});

test('a codex session without token counts reports unavailable usage, not zero', async () => {
  const parsed = await session('test/fixtures/codex/no-usage');

  assert.equal(parsed.adapter, 'codex');
  assert.equal(parsed.turns.length, 0);
  assert.equal(parsed.tokens, null);
  assert.equal(parsed.rent, null);
});

test('mixed roots report the coverage split per adapter', async () => {
  const result = await run(['audit', 'test/fixtures', '--all', '--json'], nodeDeps);
  const model = JSON.parse(result.stdout);
  const adapters = new Set(model.sessions.map((s: { adapter: string }) => s.adapter));

  assert.ok(adapters.has('claude-code'));
  assert.ok(adapters.has('codex'));
});

test('a codex session and an equivalent claude session produce the same model', async () => {
  const codex = await session('test/fixtures/codex/basic');
  const claude = await session('test/fixtures/claude-code/codex-equivalent');

  const shape = (parsed: { turns: { injections: { kind: string }[] }[] }) =>
    parsed.turns.map((turn) => turn.injections.map((injection) => injection.kind));

  assert.equal(codex.turns.length, claude.turns.length);
  assert.equal(codex.rent, claude.rent);
  assert.deepEqual(shape(codex), shape(claude));
});
