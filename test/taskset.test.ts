import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';
import { parseTaskSet, templateTaskSet } from '../src/taskset.ts';

const valid = {
  runner: 'claude',
  repeat: 2,
  tasks: [
    { id: 'a', prompt: 'do a', verify: 'exit 0' },
    { id: 'b', prompt: 'do b', verify: 'exit 0' },
  ],
};

test('a valid task set parses', () => {
  const result = parseTaskSet(JSON.stringify(valid));

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.taskSet.tasks.length, 2);
});

test('an invalid task set names the offending field', () => {
  const cases: [unknown, RegExp][] = [
    [{ ...valid, runner: 'gemini' }, /runner/],
    [{ ...valid, repeat: 0 }, /repeat/],
    [{ ...valid, repeat: 101 }, /repeat/],
    [{ ...valid, tasks: [] }, /tasks/],
    [{ ...valid, tasks: [{ id: 'a', prompt: 'x' }] }, /verify/],
    [{ ...valid, tasks: [{ id: '', prompt: 'x', verify: 'y' }] }, /id/],
    [
      { ...valid, tasks: [{ id: 'a', prompt: 'x', verify: 'y' }, { id: 'a', prompt: 'x', verify: 'y' }] },
      /duplicated/,
    ],
  ];

  for (const [document, expected] of cases) {
    const result = parseTaskSet(JSON.stringify(document));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, expected);
  }
});

test('invalid json is rejected', () => {
  const result = parseTaskSet('{nope');

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /not valid JSON/);
});

test('init writes a template that validates as it is', async () => {
  const writes: { path: string; content: string }[] = [];
  const deps = {
    ...nodeDeps,
    async kind() {
      return 'missing' as const;
    },
    async writeArtifact(path: string, content: string) {
      writes.push({ path, content });
    },
  };

  const result = await run(['init'], deps);

  assert.equal(result.exitCode, 0);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.path, 'ctxrent.json');

  const parsed = parseTaskSet(writes[0]?.content ?? '');
  assert.equal(parsed.ok, true);
  assert.equal(templateTaskSet().includes('"tasks"'), true);
});

test('init refuses to overwrite an existing task set', async () => {
  const deps = {
    ...nodeDeps,
    async kind() {
      return 'file' as const;
    },
    async writeArtifact() {
      throw new Error('must not write');
    },
  };

  const result = await run(['init'], deps);

  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /already exists/);
});

test('diff rejects an invalid task set before running anything', async () => {
  let executed = 0;
  const deps = {
    ...nodeDeps,
    async readText() {
      return JSON.stringify({ ...valid, runner: 'gemini' });
    },
    async exec() {
      executed += 1;
      return { code: 0, stdout: '', stderr: '' };
    },
  };

  const result = await run(['diff', 'ctxrent.json', '--a', 'a', '--b', 'b'], deps);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /runner/);
  assert.equal(executed, 0);
});

test('diff needs both variants', async () => {
  const deps = {
    ...nodeDeps,
    async readText() {
      return JSON.stringify(valid);
    },
  };

  const result = await run(['diff', 'ctxrent.json', '--a', 'a'], deps);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /--a <dir> and --b <dir>/);
});
