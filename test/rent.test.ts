import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';

async function session(fixture: string) {
  const result = await run(['audit', fixture, '--json'], nodeDeps);
  assert.equal(result.exitCode, 0);
  return JSON.parse(result.stdout).sessions[0];
}

test('rent charges every injection for the turns it survives', async () => {
  // user message (100 tokens) enters at turn 1 of 2, so it pays 2 turns.
  // file read (200), attachment (30) enter at turn 2, so they pay 1 turn.
  const parsed = await session('test/fixtures/claude-code/injections');

  assert.equal(parsed.rent, 100 * 2 + 200 + 30);
  assert.equal(parsed.rentScore, 100);
});

test('rent is additive across carriers', async () => {
  const parsed = await session('test/fixtures/claude-code/waste');
  const sum = parsed.carriers.reduce((total: number, carrier: { rent: number }) => total + carrier.rent, 0);

  assert.equal(sum, parsed.rent);
  assert.equal(parsed.rent, 5850);
});

test('a session with no measurable content reports no rent', async () => {
  const parsed = await session('test/fixtures/claude-code/all-unknown');

  assert.equal(parsed.rent, null);
  assert.equal(parsed.rentScore, null);
});

test('rent does not depend on session length alone', async () => {
  const shortSession = await session('test/fixtures/claude-code/injections');
  const longSession = await session('test/fixtures/claude-code/waste');

  assert.equal(shortSession.rentScore, 100);
  assert.equal(longSession.rentScore, 56);
  assert.notEqual(shortSession.rentScore, longSession.rentScore);
});

test('a compaction ends the rent of the content it dropped', async () => {
  // Turns 1-2 form one context epoch, turns 3-4 another. Without the epoch rule this rent
  // would be 100x4 + 40x2 = 480; the drop at turn 3 means the first read stopped paying.
  const parsed = await session('test/fixtures/claude-code/compaction');

  assert.equal(parsed.rent, 280);
  assert.equal(parsed.residualContextTokens, 1760);
});

test('a one-token dip is noise, not a compaction', async () => {
  const parsed = await session('test/fixtures/claude-code/small-drop');

  assert.equal(parsed.rent, 20);
});
