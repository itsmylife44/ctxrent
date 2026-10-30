import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';

const lines = [
  JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: 'xxxx' }] },
  }),
  JSON.stringify({
    type: 'assistant',
    message: {
      id: 'msg_1',
      role: 'assistant',
      content: [],
      usage: {
        input_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        output_tokens: 1,
      },
    },
  }),
].join('\n');

function fakeDeps(files: string[]) {
  return {
    ...nodeDeps,
    async defaultRoots() {
      return ['root'];
    },
    async kind(path: string) {
      return path === 'root' ? ('directory' as const) : ('file' as const);
    },
    async listDir() {
      return files;
    },
    async modifiedAt(path: string) {
      return path.endsWith('new.jsonl') ? 2 : 1;
    },
    async readText() {
      return lines;
    },
  };
}

test('with no arguments, ctxrent audits the most recent session', async () => {
  const result = await run([], fakeDeps(['old.jsonl', 'new.jsonl']));

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /session new/);
});

test('with no arguments and no sessions, ctxrent says so', async () => {
  const result = await run([], fakeDeps([]));

  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /no sessions found/);
});

test('check --all with no path gates the whole archive, not the latest session', async () => {
  let reads = 0;
  const deps = {
    ...nodeDeps,
    async defaultRoots() {
      return ['root'];
    },
    async kind(path: string) {
      return path === 'root' ? ('directory' as const) : ('file' as const);
    },
    async listDir() {
      return ['a.jsonl', 'b.jsonl'];
    },
    async readText() {
      reads += 1;
      return lines;
    },
    async modifiedAt() {
      return 1;
    },
    notify() {},
  };

  const result = await run(['check', '--all', '--max-waste', '40'], deps);

  // The fixture carries no file read or named tool result, so waste is unmeasurable: exit 2.
  // The point is that both sessions were read, not just the most recent one.
  assert.equal(reads, 2);
  assert.equal(result.exitCode, 2);
});

const withWaste = [
  JSON.stringify({
    type: 'user',
    sessionId: 's',
    message: { role: 'user', content: [{ type: 'text', text: 'x'.repeat(40) }] },
  }),
  JSON.stringify({
    type: 'assistant',
    sessionId: 's',
    message: {
      id: 'm1',
      role: 'assistant',
      content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'cat docs/x.md' } }],
      usage: { input_tokens: 1, cache_read_input_tokens: 999, cache_creation_input_tokens: 0, output_tokens: 1 },
    },
  }),
  JSON.stringify({
    type: 'user',
    sessionId: 's',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'x'.repeat(2400) }] }],
    },
  }),
  JSON.stringify({
    type: 'assistant',
    sessionId: 's',
    message: { id: 'm2', role: 'assistant', content: [], usage: { input_tokens: 1, cache_read_input_tokens: 1999, cache_creation_input_tokens: 0, output_tokens: 1 } },
  }),
  JSON.stringify({
    type: 'assistant',
    sessionId: 's',
    message: { id: 'm3', role: 'assistant', content: [], usage: { input_tokens: 1, cache_read_input_tokens: 2999, cache_creation_input_tokens: 0, output_tokens: 1 } },
  }),
  JSON.stringify({
    type: 'assistant',
    sessionId: 's',
    message: { id: 'm4', role: 'assistant', content: [], usage: { input_tokens: 1, cache_read_input_tokens: 3999, cache_creation_input_tokens: 0, output_tokens: 1 } },
  }),
].join('\n');

test('with no arguments a terminal opens the page you can apply from', async () => {
  const written: { path: string; content: string }[] = [];
  const notified: string[] = [];
  let opened = '';

  const deps = {
    ...nodeDeps,
    interactive: true,
    async defaultRoots() {
      return ['root'];
    },
    async kind(path: string) {
      return path === 'root' ? ('directory' as const) : ('file' as const);
    },
    async listDir() {
      return ['a.jsonl', 'b.jsonl', 'c.jsonl'];
    },
    async modifiedAt() {
      return Date.now();
    },
    async readText(path: string) {
      if (path === 'AGENTS.md') throw new Error('missing');
      return withWaste;
    },
    async writeArtifact(path: string, content: string) {
      written.push({ path, content });
    },
    async openUrl(url: string) {
      opened = url;
      const form = new URLSearchParams();
      form.append('rule', 'read-via-read-tool');
      form.append('target', 'AGENTS.md');
      const response = await fetch(`${url}/apply`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      assert.equal(response.status, 200);
    },
    notify(message: string) {
      notified.push(message);
    },
  };

  const result = await run([], deps);

  assert.equal(result.exitCode, 0);
  assert.match(opened, /^http:\/\/127\.0\.0\.1:\d+\//);
  assert.ok(notified.join('').includes('session s'));
  assert.match(result.stdout, /applied 1 rule\(s\) to AGENTS\.md/);

  const applied = written.find((entry) => entry.path === 'AGENTS.md');
  assert.match(applied?.content ?? '', /Read files with the Read tool/);
});

test('with no arguments and no terminal, no file is written', async () => {
  const written: string[] = [];
  const base = fakeDeps(['new.jsonl']);
  const deps = {
    ...base,
    interactive: false,
    async writeArtifact(path: string) {
      written.push(path);
    },
  };

  const result = await run([], deps);

  assert.equal(result.exitCode, 0);
  assert.equal(written.length, 0);
});
