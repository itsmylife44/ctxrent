import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';

const waste = 'test/fixtures/claude-code/waste';

test('the terminal report leads with rent and the score', async () => {
  const result = await run(['audit', waste], nodeDeps);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /rent 5,850 token-turns/);
  assert.match(result.stdout, /score 56\/100/);
});

test('the terminal report lists the worst offenders with rent, size and uses', async () => {
  const result = await run(['audit', waste], nodeDeps);

  assert.match(result.stdout, /Grep/);
  assert.match(result.stdout, /2,400 rent/);
  assert.match(result.stdout, /600 tok/);
});

test('each waste class gets a section with its accumulated rent', async () => {
  const result = await run(['audit', waste], nodeDeps);

  assert.match(result.stdout, /dead-payload\s+1,800/);
  assert.match(result.stdout, /superseded-read\s+500/);
  assert.match(result.stdout, /retry-loop\s+300/);
});

test('the terminal report fits eighty columns', async () => {
  const result = await run(['audit', waste], nodeDeps);

  for (const line of result.stdout.split('\n')) {
    assert.ok(line.length <= 80, `line too long (${line.length}): ${line}`);
  }
});

test('the html report is a single self-contained document', async () => {
  const writes: { path: string; content: string }[] = [];
  const deps = {
    ...nodeDeps,
    async writeArtifact(path: string, content: string) {
      writes.push({ path, content });
    },
  };

  const result = await run(['audit', waste, '--html', 'report.html'], deps);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /wrote report\.html/);
  assert.equal(writes.length, 1);

  const html = writes[0]?.content ?? '';
  assert.match(html, /^<!doctype html>/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<link/i);
  assert.match(html, /5,850/);
  assert.match(html, /Grep/);
});

test('the html report escapes carrier names', async () => {
  const writes: { content: string }[] = [];
  const deps = {
    ...nodeDeps,
    async readText(path: string) {
      const text = await nodeDeps.readText(path);
      return text.replaceAll('Grep', '<script>alert(1)</script>');
    },
    async writeArtifact(_path: string, content: string) {
      writes.push({ content });
    },
  };

  await run(['audit', wx(), '--html', 'report.html'], deps);
  const html = writes[0]?.content ?? '';

  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

function wx(): string {
  return 'test/fixtures/claude-code/waste';
}

test('the terminal report matches the golden file', async () => {
  const result = await run(['audit', waste], nodeDeps);
  const golden = await readFile('test/golden/waste-report.txt', 'utf8');

  assert.equal(result.stdout, golden);
});

test('an unmeasurable session reports rent as unavailable, never zero', async () => {
  const result = await run(['audit', 'test/fixtures/claude-code/all-unknown'], nodeDeps);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /rent unavailable/);
  assert.match(result.stdout, /unavailable: the record does not say enough to classify/);
  assert.doesNotMatch(result.stdout, /rent 0 token-turns/);
});

test('a failure below the seam becomes a diagnostic, not a rejected promise', async () => {
  const deps = {
    ...nodeDeps,
    async kind() {
      return 'directory' as const;
    },
    async listDir() {
      throw new Error('permission denied');
    },
  };

  const result = await run(['audit', 'somewhere'], deps);

  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /permission denied/);
});
