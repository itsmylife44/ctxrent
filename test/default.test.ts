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
