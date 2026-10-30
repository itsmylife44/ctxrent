import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';

test('audit --all walks every session under a root and reports totals', async () => {
  const result = await run(['audit', 'test/fixtures/claude-code', '--all'], nodeDeps);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /sessions 15/);
  assert.match(result.stdout, /coverage: \d+ sessions with usage, \d+ without/);
});

test('audit --all states how many sessions the totals are built from', async () => {
  const result = await run(['audit', 'test/fixtures/claude-code', '--all', '--json'], nodeDeps);
  const model = JSON.parse(result.stdout);

  assert.equal(model.sessions.length, 15);
  assert.equal(model.totals.measuredSessions + model.totals.unmeasuredSessions, 15);
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

test('--since compares only sessions modified after a date', async () => {
  const old = Date.parse('2026-01-01T00:00:00Z');
  const recent = Date.parse('2026-10-01T00:00:00Z');
  const deps = {
    ...nodeDeps,
    async kind(path: string) {
      return path === 'root' ? ('directory' as const) : ('file' as const);
    },
    async listDir() {
      return ['old.jsonl', 'new.jsonl'];
    },
    async modifiedAt(path: string) {
      return path.includes('old') ? old : recent;
    },
    async readText() {
      return '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"xxxx"}]}}\n{"type":"assistant","message":{"id":"m","role":"assistant","content":[],"usage":{"input_tokens":1,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"output_tokens":1}}}\n';
    },
  };

  const all = await run(['audit', 'root', '--all', '--json'], deps);
  const since = await run(['audit', 'root', '--all', '--json', '--since', '2026-06-01'], deps);

  assert.equal(JSON.parse(all.stdout).sessions.length, 2);
  assert.equal(JSON.parse(since.stdout).sessions.length, 1);
});

test('--since rejects a value that is not a date', async () => {
  const result = await run(['audit', 'root', '--since', 'yesterday'], nodeDeps);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /not a date/);
});
