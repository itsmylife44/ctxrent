import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';
import { composeBlock, mergeBlock, readManagedRules, teach } from '../src/teach.ts';

const AGENT_OUTPUT = [
  '- Read files with the Read tool, never by piping them through Bash. <!-- id: read-via-read-tool -->',
  '- Keep the output of a command small. <!-- id: cap-command-output -->',
  '- An invented rule with an unknown id. <!-- id: not-a-real-finding -->',
].join('\n');

async function sessions() {
  const result = await run(['audit', 'test/fixtures/claude-code', '--all', '--json'], nodeDeps);
  return JSON.parse(result.stdout).sessions;
}

function writingDeps(options: { interactive: boolean; answer: boolean }) {
  const stored = new Map<string, string>();
  const writes: string[] = [];
  const questions: string[] = [];
  return {
    stored,
    writes,
    questions,
    deps: {
      ...nodeDeps,
      interactive: options.interactive,
      async confirm(question: string) {
        questions.push(question);
        return options.answer;
      },
      async execFile(_file: string, _args: string[]) {
        return { code: 0, stdout: AGENT_OUTPUT, stderr: '' };
      },
      async readText(path: string) {
        if (path === 'AGENTS.md') {
          if (!stored.has(path)) throw new Error('missing');
          return stored.get(path) as string;
        }
        return nodeDeps.readText(path);
      },
      async writeArtifact(path: string, content: string) {
        writes.push(path);
        stored.set(path, content);
      },
      notify() {},
    },
  };
}

const teachArgs = [
  'teach',
  'test/fixtures/claude-code',
  '--min-sessions',
  '1',
  '--agent',
  'claude',
  '--write',
  'AGENTS.md',
];

test('teach only keeps findings that recur across sessions', async () => {
  const all = await sessions();

  assert.equal(teach(all, { minSessions: 5 }).length, 0);
  assert.ok(teach(all, { minSessions: 1 }).length >= 4);
});

test('teach marks configuration findings as such', async () => {
  const rules = teach(await sessions(), { minSessions: 1 });

  assert.equal(rules.find((rule) => rule.id === 'duplicate-context')?.lever, 'configuration');
  assert.equal(rules.find((rule) => rule.id === 'read-via-read-tool')?.lever, 'instruction');
});

test('without a runner, teach hands over a brief instead of inventing wording', async () => {
  const harness = writingDeps({ interactive: true, answer: true });

  const result = await run(['teach', 'test/fixtures/claude-code', '--min-sessions', '1'], harness.deps);

  assert.equal(result.exitCode, 0);
  assert.equal(harness.writes.length, 0);
  assert.match(result.stdout, /--- brief ---/);
  assert.match(result.stdout, /at most 20 words/);
});

test('the agent output is validated: unknown ids and prose are dropped', async () => {
  const harness = writingDeps({ interactive: true, answer: true });

  await run(teachArgs, harness.deps);
  const written = harness.stored.get('AGENTS.md') ?? '';

  assert.match(written, /Read files with the Read tool/);
  assert.doesNotMatch(written, /invented rule/);
  assert.doesNotMatch(written, /not-a-real-finding/);
});

test('the block keeps the id marker so a rewrite can be recognised', () => {
  const block = composeBlock([{ id: 'read-via-read-tool', advice: 'Leggi con Read.' }], 10, '2026-10-30');

  assert.match(block, /- Leggi con Read\. <!-- id: read-via-read-tool -->/);
});

test('readManagedRules reads what is already in the block', () => {
  const existing = '<!-- ctxrent:begin -->\n- First rule.\n- Second. <!-- id: x -->\n<!-- ctxrent:end -->';

  assert.deepEqual(readManagedRules(existing), [
    { id: null, advice: 'First rule.' },
    { id: 'x', advice: 'Second.' },
  ]);
});

test('merging preserves the user text around the block', () => {
  const existing = '# My rules\n\n<!-- ctxrent:begin -->\nold\n<!-- ctxrent:end -->\n\ntail\n';
  const merged = mergeBlock(existing, '<!-- ctxrent:begin -->\nnew\n<!-- ctxrent:end -->');

  assert.match(merged, /# My rules/);
  assert.match(merged, /new/);
  assert.doesNotMatch(merged, /old/);
});

test('teach refuses to edit without confirmation when nobody can answer', async () => {
  const harness = writingDeps({ interactive: false, answer: false });

  const result = await run(teachArgs, harness.deps);

  assert.equal(result.exitCode, 1);
  assert.equal(harness.writes.length, 0);
  assert.match(result.stderr, /refusing to edit an instruction file without confirmation/);
});

test('teach asks before writing, and writes only on yes', async () => {
  const declined = writingDeps({ interactive: true, answer: false });
  const declinedResult = await run(teachArgs, declined.deps);

  assert.equal(declinedResult.exitCode, 0);
  assert.equal(declined.writes.length, 0);
  assert.equal(declined.questions.length, 1);
  assert.match(declinedResult.stdout, /nothing written\./);

  const accepted = writingDeps({ interactive: true, answer: true });
  const acceptedResult = await run(teachArgs, accepted.deps);

  assert.equal(acceptedResult.exitCode, 0);
  assert.equal(accepted.writes.length, 1);
  assert.match(acceptedResult.stdout, /wrote the managed block to AGENTS\.md/);
});

test('an update keeps a rule that today does not recur', async () => {
  const harness = writingDeps({ interactive: true, answer: true });
  harness.stored.set(
    'AGENTS.md',
    '<!-- ctxrent:begin -->\n- Keep this custom rule.\n<!-- ctxrent:end -->\n',
  );

  await run(teachArgs, harness.deps);
  const written = harness.stored.get('AGENTS.md') ?? '';

  assert.match(written, /Keep this custom rule\./);
  assert.match(written, /Read files with the Read tool/);
});

test('a failing runner is reported, not turned into an empty block', async () => {
  const harness = writingDeps({ interactive: true, answer: true });
  harness.deps.execFile = async () => ({ code: 127, stdout: '', stderr: 'not found' });

  const result = await run(teachArgs, harness.deps);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /not available|no usable rule/);
});

test('an old block without ids does not collect a second copy of each rule', () => {
  const legacyOnly = [
    '<!-- ctxrent:begin -->',
    '- Read files with the Read tool (offset/limit), never by piping them through Bash.',
    '- My own rule.',
    '<!-- ctxrent:end -->',
  ].join('\n');
  assert.deepEqual(readManagedRules(legacyOnly), [
    { id: 'read-via-read-tool', advice: 'Read files with the Read tool (offset/limit), never by piping them through Bash.' },
    { id: null, advice: 'My own rule.' },
  ]);

  // The block a Windows run produced: the old sentence, then the agent's version with its id.
  const duplicated = [
    '<!-- ctxrent:begin -->',
    '- Read files with the Read tool (offset/limit), never by piping them through Bash.',
    '- Read files with the Read tool, never through cat in Bash. <!-- id: read-via-read-tool -->',
    '<!-- ctxrent:end -->',
  ].join('\n');
  assert.deepEqual(readManagedRules(duplicated), [
    { id: 'read-via-read-tool', advice: 'Read files with the Read tool, never through cat in Bash.' },
  ]);
});

test('the managed block says when it was applied, so later runs can measure only what came after', () => {
  const block = composeBlock([{ id: 'read-via-read-tool', advice: 'Leggi con Read.' }], 1314, '2026-10-30');

  assert.match(block, /Measured by ctxrent on 1,314 sessions, applied 2026-10-30\./);
});
