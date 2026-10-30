import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';
import type { Deps } from '../src/deps.ts';

const A = 'variants/a';
const B = 'variants/b';

const taskSet = {
  runner: 'claude',
  repeat: 2,
  tasks: [
    { id: 'passes', prompt: 'p', verify: 'verify-1' },
    { id: 'regresses', prompt: 'p', verify: 'verify-2' },
    { id: 'broken', prompt: 'p', verify: 'verify-3' },
  ],
};

function stream(variant: string | undefined): string {
  const chars = variant === A ? 4000 : 2000;
  return [
    JSON.stringify({
      type: 'user',
      sessionId: 'run',
      message: { role: 'user', content: [{ type: 'text', text: 'x'.repeat(chars) }] },
    }),
    JSON.stringify({
      type: 'assistant',
      sessionId: 'run',
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
}

function fakeDeps(options: { agentCode?: number } = {}): Deps & { agentRuns: () => number } {
  let counter = 0;
  let agentRuns = 0;
  const variantOf = new Map<string, string>();

  return {
    ...nodeDeps,
    agentRuns: () => agentRuns,
    async kind() {
      return 'missing' as const;
    },
    async readText() {
      return JSON.stringify(taskSet);
    },
    async makeTempDir() {
      counter += 1;
      return `/tmp/ctxrent-fake-${counter}`;
    },
    async copyDir(from: string, to: string) {
      variantOf.set(to, from);
    },
    async removeDir() {},
    async exec(command: string, cwd: string) {
      const variant = variantOf.get(cwd);

      if (command.startsWith('command -v')) return { code: 0, stdout: '', stderr: '' };

      if (command.startsWith('claude') || command.startsWith('codex')) {
        agentRuns += 1;
        return { code: options.agentCode ?? 0, stdout: stream(variant), stderr: '' };
      }

      const task = command.replace('verify-', '');
      if (task === '1') return { code: 0, stdout: '', stderr: '' };
      if (task === '2') return { code: variant === A ? 0 : 1, stdout: '', stderr: '' };
      return { code: 1, stdout: '', stderr: '' };
    },
  };
}

test('diff runs both variants over the same task set', async () => {
  const deps = fakeDeps();
  const result = await run(['diff', 'ctxrent.json', '--a', A, '--b', B], deps);

  assert.equal(result.exitCode, 0);
  assert.equal(deps.agentRuns(), 12);
  assert.match(result.stdout, /3 tasks x 2 runs · runner claude/);
});

test('diff reports rent and success deltas', async () => {
  const result = await run(['diff', 'ctxrent.json', '--a', A, '--b', B], fakeDeps());

  assert.match(result.stdout, /a {2}4\/6 passed · 6,000 rent/);
  assert.match(result.stdout, /b {2}2\/6 passed · 3,000 rent/);
  assert.match(result.stdout, /delta {2}rent −3,000 \(−50%\) · success −2/);
});

test('diff separates a regression from a task that fails either way', async () => {
  const result = await run(['diff', 'ctxrent.json', '--a', A, '--b', B], fakeDeps());

  assert.match(result.stdout, /regresses\s+a 2\/2\s+b 0\/2\s+regressed/);
  assert.match(result.stdout, /broken\s+a 0\/2\s+b 0\/2\s+fails in both/);
  assert.match(result.stdout, /passes\s+a 2\/2\s+b 2\/2\n/);
});

test('a runner that is not installed is reported as unavailable, not as a failure', async () => {
  const result = await run(['diff', 'ctxrent.json', '--a', A, '--b', B], fakeDeps({ agentCode: 127 }));

  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /runner "claude" is not available/);
});

test('every run happens in its own working copy and is cleaned up afterwards', async () => {
  const copies: string[] = [];
  const removed: string[] = [];
  const base = fakeDeps();
  const deps: Deps = {
    ...base,
    async copyDir(from: string, to: string) {
      copies.push(to);
      await base.copyDir(from, to);
    },
    async removeDir(path: string) {
      removed.push(path);
      await base.removeDir(path);
    },
  };

  const result = await run(['diff', 'ctxrent.json', '--a', A, '--b', B], deps);

  assert.equal(result.exitCode, 0);
  assert.equal(new Set(copies).size, 12);
  assert.deepEqual(new Set(removed), new Set(copies));
});
