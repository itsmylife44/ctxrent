// One test per bug found by the October 2026 audit; each fails on the code before its fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';
import { epochEnds } from '../src/epochs.ts';
import { classifyWaste } from '../src/waste.ts';
import { summariseSessions } from '../src/model.ts';
import type { Injection, SessionSummary, Turn } from '../src/model.ts';

function turn(index: number, contextTokens: number | null, extra: Partial<Turn> = {}): Turn {
  return {
    index,
    messageId: `m${index}`,
    contextTokens,
    outputTokens: 1,
    injections: [],
    toolCalls: [],
    attribution: null,
    ...extra,
  };
}

function injection(kind: Injection['kind'], carrier: string, size: number, path: string | null = null): Injection {
  return { kind, carrier, path, contentHash: carrier, size, sizeMethod: 'estimated' };
}

const session = [
  JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'xxxx' }] } }),
  JSON.stringify({
    type: 'assistant',
    message: {
      id: 'msg_1',
      role: 'assistant',
      content: [],
      usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 },
    },
  }),
].join('\n');

function archive(files: Record<string, string>, modified: Record<string, number> = {}) {
  const directories = new Set(['root', 'root/p', 'root/p/s', 'root/p/s/subagents']);
  return {
    ...nodeDeps,
    interactive: false,
    async defaultRoots() {
      return ['root'];
    },
    async kind(path: string) {
      if (directories.has(path)) return 'directory' as const;
      return path in files ? ('file' as const) : ('missing' as const);
    },
    async listDir(path: string) {
      const children = new Set<string>();
      for (const name of [...directories, ...Object.keys(files)]) {
        if (name.startsWith(`${path}/`)) children.add(name.slice(path.length + 1).split('/')[0] as string);
      }
      return [...children];
    },
    async readText(path: string) {
      const text = files[path];
      if (text === undefined) throw new Error('missing');
      return text;
    },
    async modifiedAt(path: string) {
      return modified[path] ?? 1;
    },
  };
}

test('archive waste is a share of the rent of judged sessions only', () => {
  const judged = { turns: [], rent: 100, wasteRent: 67, tokens: null, injectedTokens: 0, unknownInjections: 0 };
  const unjudged = { ...judged, wasteRent: null };
  const { totals } = summariseSessions([judged, unjudged] as unknown as SessionSummary[]);

  assert.equal(totals.assessedRent, 100);
  assert.equal(totals.rentScore, 33);
});

test('a turn with no usage does not hide the compaction after it', () => {
  const ends = epochEnds([turn(1, 100_000), turn(2, 0), turn(3, 20_000), turn(4, 21_000)]);

  assert.deepEqual(ends, [2, 2, 4, 4]);
});

test('a read is superseded by the first write after it, not by an earlier one', () => {
  const claims = classifyWaste([
    turn(1, 1000, { toolCalls: [{ name: 'Write', input: { file_path: 'x.ts' } }] }),
    turn(2, 1000),
    turn(3, 1000, {
      injections: [injection('file-read', 'Read x.ts', 300, 'x.ts')],
      toolCalls: [{ name: 'Edit', input: { file_path: 'x.ts' } }],
    }),
    turn(4, 1000),
    turn(5, 1000),
  ]);

  assert.ok(claims.some((claim) => claim.kind === 'superseded-read'));
});

test('a tool result of exactly 500 tokens is not over the dead-payload threshold', () => {
  const claims = classifyWaste([
    turn(1, 1000, { injections: [injection('tool-result', 'Grep x', 500)] }),
    turn(2, 1000),
    turn(3, 1000),
    turn(4, 1000),
  ]);

  assert.ok(!claims.some((claim) => claim.kind === 'dead-payload'));
});

test('subagent transcripts are not counted as sessions of their own', async () => {
  const deps = archive({
    'root/p/s.jsonl': session,
    'root/p/s/subagents/a.jsonl': session,
    'root/p/s/subagents/b.jsonl': session,
  });
  const result = await run(['audit', 'root', '--all', '--json'], deps);

  assert.equal(result.exitCode, 0);
  assert.equal(JSON.parse(result.stdout).sessions.length, 1);
});

test('a file with no readable record is not a session', async () => {
  const deps = archive({ 'root/p/s.jsonl': session, 'root/p/bad.jsonl': 'not json\n' });
  const result = await run(['audit', 'root', '--all', '--json'], deps);

  assert.equal(JSON.parse(result.stdout).sessions.length, 1);
});

test('check --all --since with no path ignores older sessions', async () => {
  const deps = archive({ 'root/p/old.jsonl': session }, { 'root/p/old.jsonl': Date.parse('2026-01-01') });
  const result = await run(['check', '--all', '--since', '2026-10-01'], deps);

  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /no sessions found/);
});

test('check exits 2, not 1, when there is nothing to measure', async () => {
  const result = await run(['check', '--all'], archive({}));

  assert.equal(result.exitCode, 2);
});

test('ctxrent --html applies to the latest session, as documented', async () => {
  const written: string[] = [];
  const deps = {
    ...archive({ 'root/p/s.jsonl': session }),
    async writeArtifact(path: string) {
      written.push(path);
    },
  };
  const result = await run(['--html', 'out.html', '--no-open'], deps);

  assert.equal(result.exitCode, 0, result.stderr);
  assert.deepEqual(written, ['out.html']);
});
