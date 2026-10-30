import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';
import { instructionBlock, mergeBlock, readManagedRules, teach } from '../src/teach.ts';

async function sessions() {
  const result = await run(['audit', 'test/fixtures/claude-code', '--all', '--json'], nodeDeps);
  return JSON.parse(result.stdout).sessions;
}

test('teach only keeps rules that recur across sessions', async () => {
  const all = await sessions();

  const strict = teach(all, { minSessions: 5 });
  const loose = teach(all, { minSessions: 1 });

  assert.equal(strict.length, 0);
  assert.ok(loose.length >= 4);
});

test('teach separates instructions from configuration', async () => {
  const rules = teach(await sessions(), { minSessions: 1 });

  const duplicate = rules.find((rule) => rule.id === 'duplicate-context');
  const read = rules.find((rule) => rule.id === 'read-via-read-tool');

  assert.equal(duplicate?.lever, 'configuration');
  assert.equal(read?.lever, 'instruction');
});

test('the instruction block never contains a configuration rule', async () => {
  const all = await sessions();
  const block = instructionBlock(teach(all, { minSessions: 1 }), all.length);

  assert.match(block, /Read files with the Read tool/);
  assert.doesNotMatch(block, /Move fixed context into a file/);
  assert.match(block, /^<!-- ctxrent:begin -->/);
  assert.match(block, /<!-- ctxrent:end -->$/);
});

test('merging into a missing file creates the block', () => {
  const merged = mergeBlock(null, '<!-- ctxrent:begin -->\nX\n<!-- ctxrent:end -->');

  assert.match(merged, /^<!-- ctxrent:begin -->/);
});

test('merging preserves the user text around the block', () => {
  const existing = '# My rules\n\nBe kind.\n\n<!-- ctxrent:begin -->\nold\n<!-- ctxrent:end -->\n\nMore text.\n';
  const merged = mergeBlock(existing, '<!-- ctxrent:begin -->\nnew\n<!-- ctxrent:end -->');

  assert.match(merged, /# My rules/);
  assert.match(merged, /Be kind\./);
  assert.match(merged, /More text\./);
  assert.match(merged, /new/);
  assert.doesNotMatch(merged, /old/);
});

test('merging twice is idempotent', () => {
  const block = '<!-- ctxrent:begin -->\nX\n<!-- ctxrent:end -->';
  const once = mergeBlock(null, block);
  const twice = mergeBlock(once, block);

  assert.equal(twice, once);
});

test('teach is a dry run unless --write is passed', async () => {
  const writes: string[] = [];
  const deps = {
    ...nodeDeps,
    async writeArtifact(path: string) {
      writes.push(path);
    },
  };

  const result = await run(['teach', 'test/fixtures/claude-code', '--min-sessions', '1'], deps);

  assert.equal(result.exitCode, 0);
  assert.equal(writes.length, 0);
  assert.match(result.stdout, /dry run/);
  assert.match(result.stdout, /ctxrent:begin/);
});

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
    },
  };
}

const teachArgs = [
  'teach',
  'test/fixtures/claude-code',
  '--min-sessions',
  '1',
  '--write',
  'AGENTS.md',
];

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
  assert.match(declined.questions[0]!, /Apply \d+ rule\(s\) to AGENTS\.md\?/);
  assert.match(declinedResult.stdout, /nothing written\./);

  const accepted = writingDeps({ interactive: true, answer: true });
  const acceptedResult = await run(teachArgs, accepted.deps);

  assert.equal(acceptedResult.exitCode, 0);
  assert.equal(accepted.writes.length, 1);
  assert.match(acceptedResult.stdout, /wrote the managed block to AGENTS\.md/);
});

test('teach --yes writes without asking, for scripted use', async () => {
  const harness = writingDeps({ interactive: false, answer: false });

  const result = await run([...teachArgs, '--yes'], harness.deps);

  assert.equal(result.exitCode, 0);
  assert.equal(harness.writes.length, 1);
  assert.equal(harness.questions.length, 0);
});

test('the preview states the target, what changes and how to undo it', async () => {
  const harness = writingDeps({ interactive: true, answer: false });

  const result = await run(teachArgs, harness.deps);

  assert.match(result.stdout, /target {3}AGENTS\.md/);
  assert.match(result.stdout, /file {5}a new file/);
  assert.match(result.stdout, /To undo, delete everything between the two markers/);
  assert.match(result.stdout, /verify the effect with: ctxrent check/);
  assert.match(result.stdout, /configuration findings — these are not instructions/);
});

test('teach --write applies the block once and updates it in place', async () => {
  const harness = writingDeps({ interactive: false, answer: false });

  await run([...teachArgs, '--yes'], harness.deps);
  const afterFirst = harness.stored.get('AGENTS.md') ?? '';
  await run([...teachArgs, '--yes'], harness.deps);

  assert.equal(harness.stored.get('AGENTS.md'), afterFirst);
  assert.equal(afterFirst.match(/ctxrent:begin/g)?.length, 1);
});

test('readManagedRules reads what is already in the block', () => {
  const existing = `# Mine\n\n<!-- ctxrent:begin -->\n## Context hygiene\n\n- First rule.\n- Second rule.\n<!-- ctxrent:end -->\n\ntail\n`;

  assert.deepEqual(readManagedRules(existing), [
    { id: null, advice: 'First rule.' },
    { id: null, advice: 'Second rule.' },
  ]);
  assert.deepEqual(readManagedRules(null), []);
  assert.deepEqual(readManagedRules('# no block here'), []);
});

test('an update keeps a rule that today does not recur', async () => {
  const harness = writingDeps({ interactive: true, answer: true });
  harness.stored.set(
    'AGENTS.md',
    '<!-- ctxrent:begin -->\n## Context hygiene\n\n- Keep this custom rule.\n<!-- ctxrent:end -->\n',
  );

  await run(teachArgs, harness.deps);
  const written = harness.stored.get('AGENTS.md') ?? '';

  assert.match(written, /Keep this custom rule\./);
  assert.match(written, /Read files with the Read tool/);
  assert.equal(written.match(/ctxrent:begin/g)?.length, 1);
});


test('a rule the user rewrote keeps their wording instead of being duplicated', async () => {
  const harness = writingDeps({ interactive: true, answer: true });
  harness.stored.set(
    'AGENTS.md',
    '<!-- ctxrent:begin -->\n## Context hygiene\n\n- Leggi i file con Read, non con cat. <!-- id: read-via-read-tool -->\n<!-- ctxrent:end -->\n',
  );

  await run(teachArgs, harness.deps);
  const written = harness.stored.get('AGENTS.md') ?? '';

  assert.match(written, /Leggi i file con Read, non con cat\./);
  assert.doesNotMatch(written, /Read files with the Read tool/);
  assert.equal(written.match(/id: read-via-read-tool/g)?.length, 1);
});
