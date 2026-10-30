import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';
import { findPatterns } from '../src/prescriptions.ts';

async function findingsOf(fixture: string) {
  const result = await run(['audit', fixture, '--json'], nodeDeps);
  const session = JSON.parse(result.stdout).sessions[0];
  return findPatterns({ claims: session.waste, carriers: session.carriers, rent: session.rent });
}

test('a finding describes what was observed, not what to do', async () => {
  const findings = await findingsOf('test/fixtures/claude-code/shell-reads');

  assert.equal(findings[0]?.id, 'read-via-read-tool');
  assert.match(findings[0]?.label ?? '', /files read through Bash/);
  assert.equal(findings[0]?.lever, 'instruction');
  assert.equal(findings[0]?.saving, 2400);
});

test('a finding carries the command that caused it', async () => {
  const findings = await findingsOf('test/fixtures/claude-code/shell-reads');

  assert.match(findings[0]?.example ?? '', /cat docs\/adr\/0006\.md/);
});

test('findings are ranked by the rent they explain', async () => {
  const findings = await findingsOf('test/fixtures/claude-code/shell-reads');

  assert.ok((findings[0]?.saving ?? 0) >= (findings[1]?.saving ?? 0));
});

test('an always-on attachment is a configuration finding, not an instruction', async () => {
  const findings = await findingsOf('test/fixtures/claude-code/always-on');

  assert.equal(findings[0]?.id, 'attachment-bloat');
  assert.equal(findings[0]?.lever, 'configuration');
  assert.match(findings[0]?.label ?? '', /re-injected on every turn/);
});
