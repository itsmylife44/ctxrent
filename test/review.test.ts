import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';
import { startReview } from '../src/review.ts';
import { renderReview } from '../src/report/review.ts';

function reviewDeps(onUrl: (url: string) => Promise<void>) {
  const stored = new Map<string, string>();
  return {
    stored,
    deps: {
      ...nodeDeps,
      async openUrl(url: string) {
        await onUrl(url);
      },
      async readText(path: string) {
        if (path === 'OUT.md') {
          if (!stored.has(path)) throw new Error('missing');
          return stored.get(path) as string;
        }
        return nodeDeps.readText(path);
      },
      async writeArtifact(path: string, content: string) {
        stored.set(path, content);
      },
      notify() {},
    },
  };
}

test('the review server answers only the token path', async () => {
  const server = await startReview({
    renderPage: () => '<!doctype html><title>page</title>',
    onApply: async () => '<!doctype html><title>applied</title>',
  });

  try {
    const ok = await fetch(server.url);
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /page/);

    const denied = await fetch(server.url.replace(/\/[^/]+$/, '/wrong'));
    assert.equal(denied.status, 404);
  } finally {
    await server.close();
  }
});

test('applying from the page calls back with the selected rules and closes', async () => {
  const calls: { rules: string[]; target: string }[] = [];
  const server = await startReview({
    renderPage: () => '<!doctype html><title>page</title>',
    onApply: async (rules, target) => {
      calls.push({ rules, target });
      return '<!doctype html><title>applied</title>';
    },
  });

  const form = new URLSearchParams();
  form.append('rule', 'a');
  form.append('rule', 'b');
  form.append('target', 'OUT.md');

  const response = await fetch(`${server.url}/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  assert.equal(response.status, 200);
  assert.match(await response.text(), /applied/);
  assert.deepEqual(calls, [{ rules: ['a', 'b'], target: 'OUT.md' }]);

  await server.done;
  await server.close();
});

test('a review of the whole flow writes only the rules chosen in the page', async () => {
  const harness = reviewDeps(async (url) => {
    const form = new URLSearchParams();
    form.append('rule', 'read-via-read-tool');
    form.append('target', 'OUT.md');
    const response = await fetch(`${url}/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    assert.equal(response.status, 200);
  });

  const result = await run(
    ['review', 'test/fixtures/claude-code', '--min-sessions', '1', '--write', 'OUT.md'],
    harness.deps,
  );

  const written = harness.stored.get('OUT.md') ?? '';

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /applied 1 rule\(s\) to OUT\.md/);
  assert.match(written, /Read files with the Read tool/);
  assert.doesNotMatch(written, /Cap what a command prints/);
  assert.equal(written.match(/ctxrent:begin/g)?.length, 1);
});

test('the page carries a real form, tokens and no javascript', async () => {
  const result = await run(['audit', 'test/fixtures/claude-code/waste', '--json'], nodeDeps);
  const model = JSON.parse(result.stdout);

  const page = renderReview({
    token: 'tok',
    model,
    target: '/tmp/CLAUDE.md',
    teachings: [
      {
        id: 'read-via-read-tool',
        advice: 'Read files with the Read tool (offset/limit), never by piping them through Bash.',
        lever: 'instruction',
        saving: 2400,
        claims: 12,
        sessions: 4,
        example: 'Bash cat docs/adr/0006.md',
      },
    ],
  });

  assert.match(page, /<form id="rules" method="post" action="\/tok\/apply">/);
  assert.match(page, /name="rule" value="read-via-read-tool" checked/);
  assert.match(page, /name="target"/);
  assert.doesNotMatch(page, /<script/i);
  assert.doesNotMatch(page, /text-transform:\s*uppercase/i);
  assert.match(page, /:root\{/);
  assert.match(page, /overflow-x:clip/);
});
