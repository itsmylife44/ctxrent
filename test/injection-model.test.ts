import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';

const fixture = 'test/fixtures/claude-code/injections';

async function session() {
  const result = await run(['audit', fixture, '--json'], nodeDeps);
  assert.equal(result.exitCode, 0);
  return JSON.parse(result.stdout).sessions[0];
}

test('each turn carries the injections that preceded it', async () => {
  const parsed = await session();

  assert.equal(parsed.turns.length, 2);
  assert.deepEqual(parsed.turns[0].injections, [
    { kind: 'user-message', carrier: 'user', path: null, size: 100, sizeMethod: 'estimated' },
  ]);
});

test('a turn reports the context size recorded for it', async () => {
  const parsed = await session();

  assert.equal(parsed.turns[0].contextTokens, 1005);
  assert.equal(parsed.turns[1].contextTokens, 1207);
});

test('file reads, attachments, tool results and user messages are distinguished', async () => {
  const parsed = await session();
  const injections = parsed.turns[1].injections;

  assert.equal(injections.length, 3);
  assert.deepEqual(injections[0], {
    kind: 'file-read',
    carrier: 'Read src/example.ts',
    path: 'src/example.ts',
    size: 200,
    sizeMethod: 'estimated',
  });
  assert.deepEqual(injections[1], {
    kind: 'attachment',
    carrier: 'attachment',
    path: null,
    size: 30,
    sizeMethod: 'estimated',
  });
  assert.deepEqual(injections[2], {
    kind: 'tool-result',
    carrier: 'unknown-tool',
    path: null,
    size: null,
    sizeMethod: 'unknown',
  });
});

test('content with no recoverable size counts as unknown, not zero', async () => {
  const parsed = await session();

  assert.equal(parsed.unknownInjections, 1);
  const unknown = parsed.turns[1].injections.find((i: { size: number | null }) => i.size === null);
  assert.equal(unknown.sizeMethod, 'unknown');
});

test('the measured context a reconstruction cannot account for is reported, not hidden', async () => {
  const parsed = await session();

  assert.equal(parsed.injectionCount, 4);
  assert.equal(parsed.injectedTokens, 330);
  assert.equal(parsed.residualContextTokens, 877);
  assert.ok(parsed.residualContextTokens > 0);
});

test('the text report still counts turns', async () => {
  const result = await run(['audit', fixture], nodeDeps);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /2 turns/);
});

test('a record with no content is not counted as an unknown injection', async () => {
  const result = await run(['audit', 'test/fixtures/claude-code/no-content', '--json'], nodeDeps);

  assert.equal(result.exitCode, 0);
  const parsed = JSON.parse(result.stdout).sessions[0];
  assert.equal(parsed.turns.length, 1);
  assert.deepEqual(parsed.turns[0].injections, []);
  assert.equal(parsed.unknownInjections, 0);
});

test('an attachment whose text lives in content is measured, not unknown', async () => {
  const result = await run(['audit', 'test/fixtures/claude-code/attachments', '--json'], nodeDeps);

  assert.equal(result.exitCode, 0);
  const parsed = JSON.parse(result.stdout).sessions[0];
  assert.deepEqual(parsed.turns[0].injections, [
    { kind: 'attachment', carrier: 'attachment', path: null, size: 100, sizeMethod: 'estimated' },
  ]);
  assert.equal(parsed.unknownInjections, 0);
});

test('a system block is its own injection kind', async () => {
  const result = await run(['audit', 'test/fixtures/claude-code/system-block', '--json'], nodeDeps);

  assert.equal(result.exitCode, 0);
  const parsed = JSON.parse(result.stdout).sessions[0];
  assert.deepEqual(parsed.turns[0].injections, [
    { kind: 'system', carrier: 'system', path: null, size: 20, sizeMethod: 'estimated' },
  ]);
});

test('a session whose injections are all unknown reports no injected total, not zero', async () => {
  const result = await run(['audit', 'test/fixtures/claude-code/all-unknown', '--json'], nodeDeps);

  assert.equal(result.exitCode, 0);
  const parsed = JSON.parse(result.stdout).sessions[0];
  assert.equal(parsed.injectionCount, 1);
  assert.equal(parsed.injectedTokens, null);
  assert.equal(parsed.residualContextTokens, null);
  assert.equal(parsed.unknownInjections, 1);
});
