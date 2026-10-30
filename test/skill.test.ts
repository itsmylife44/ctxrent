import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';

const path = 'skills/ctxrent/SKILL.md';
const text = readFileSync(path, 'utf8');

function frontmatter(source: string): Record<string, string> {
  assert.ok(source.startsWith('---\n'), 'the file must start with the frontmatter');
  const end = source.indexOf('\n---', 4);
  assert.ok(end > 0, 'the frontmatter must close');
  const body = source.slice(4, end);

  const fields: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const match = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (match) fields[match[1] as string] = (match[2] ?? '').trim();
  }
  return fields;
}

test('the skill follows the Agent Skills specification', () => {
  const fields = frontmatter(text);
  const name = fields['name'] ?? '';

  assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(name.length <= 64);
  assert.equal(name, 'ctxrent', 'the name must match the directory');
  assert.ok((fields['description'] ?? '').length > 0);
  assert.ok((fields['description'] ?? '').length <= 1024);

  const allowed = new Set([
    'name',
    'description',
    'license',
    'compatibility',
    'metadata',
    'allowed-tools',
  ]);
  for (const key of Object.keys(fields)) {
    assert.ok(allowed.has(key), `field "${key}" is not in the specification`);
  }
});

test('the skill body stays inside the recommended size', () => {
  const end = text.indexOf('\n---', 4);
  const body = text.slice(end + 4);

  assert.ok(body.split('\n').length < 500, 'the body must stay under 500 lines');
  assert.ok(body.length / 4 < 5000, 'the body must stay under ~5000 tokens');
});

test('ctxrent skill prints the bundled file, so there is one copy', async () => {
  const result = await run(['skill'], nodeDeps);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, text);
});
