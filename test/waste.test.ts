import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';

async function session(fixture: string) {
  const result = await run(['audit', fixture, '--json'], nodeDeps);
  assert.equal(result.exitCode, 0);
  return JSON.parse(result.stdout).sessions[0];
}

const claims = (parsed: { waste: { kind: string }[] }) => parsed.waste.map((claim) => claim.kind);

test('a read that is superseded by a write keeps paying rent as waste', async () => {
  const parsed = await session('test/fixtures/claude-code/waste');
  const claim = parsed.waste.find((entry: { kind: string }) => entry.kind === 'superseded-read');

  assert.ok(claim);
  assert.equal(claim.carrier, 'Read src/x.ts');
  assert.deepEqual(claim.turns, [2, 2]);
  assert.equal(claim.rent, 500);
});

test('a large tool result never used again is a dead payload', async () => {
  const parsed = await session('test/fixtures/claude-code/waste');
  const claim = parsed.waste.find((entry: { kind: string }) => entry.kind === 'dead-payload');

  assert.ok(claim);
  assert.equal(claim.carrier, 'Grep x');
  assert.equal(claim.rent, 1800);
});

test('calling the same carrier twice in a row is a retry loop', async () => {
  const parsed = await session('test/fixtures/claude-code/waste');
  const claim = parsed.waste.find((entry: { kind: string }) => entry.kind === 'retry-loop');

  assert.ok(claim);
  assert.equal(claim.carrier, 'Bash ls');
  assert.equal(claim.rent, 300);
});

test('every claim names the carrier and the turns that justify it', async () => {
  const parsed = await session('test/fixtures/claude-code/waste');

  assert.deepEqual(claims(parsed).sort(), ['dead-payload', 'retry-loop', 'superseded-read']);
  for (const claim of parsed.waste) {
    assert.ok(claim.carrier.length > 0);
    assert.ok(claim.turns.length > 0);
    assert.ok(claim.reason.length > 0);
    assert.ok(claim.rent > 0);
  }
});

test('waste rent is the sum of the claims', async () => {
  const parsed = await session('test/fixtures/claude-code/waste');
  const sum = parsed.waste.reduce((total: number, claim: { rent: number }) => total + claim.rent, 0);

  assert.equal(parsed.wasteRent, 2600);
  assert.equal(parsed.rentScore, 56);
  assert.equal(sum, parsed.wasteRent);
});

test('a clean session produces no waste claims', async () => {
  const parsed = await session('test/fixtures/claude-code/injections');

  assert.deepEqual(parsed.waste, []);
  assert.equal(parsed.wasteRent, 0);
});

test('waste that cannot be decided is unavailable, not empty', async () => {
  const parsed = await session('test/fixtures/claude-code/all-unknown');

  assert.equal(parsed.wasteRent, null);
  assert.deepEqual(parsed.waste, []);
});
