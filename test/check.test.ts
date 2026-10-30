import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.ts';
import { nodeDeps } from '../src/deps.ts';

const waste = 'test/fixtures/claude-code/waste'; // 2,600 waste over 5,850 rent = 44%

test('check passes under the threshold with exit 0', async () => {
  const result = await run(['check', waste, '--max-waste', '50'], nodeDeps);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /waste 44% \(max 50%\) ok/);
});

test('check fails over the threshold with exit 1 and advice', async () => {
  const result = await run(['check', waste, '--max-waste', '40'], nodeDeps);

  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /over by 4 points/);
  assert.match(result.stdout, /what was observed/);
});

test('check refuses to pass when the record cannot be measured', async () => {
  const result = await run(['check', 'test/fixtures/claude-code/all-unknown'], nodeDeps);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /cannot measure/);
});

test('check emits the assertion shape in json', async () => {
  const result = await run(['check', waste, '--max-waste', '40', '--json'], nodeDeps);

  assert.equal(result.exitCode, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    expected: 40,
    actual: 44,
    operator: '<=',
    passed: false,
  });
});

test('check rejects a threshold outside 0..100', async () => {
  const result = await run(['check', waste, '--max-waste', '140'], nodeDeps);

  assert.equal(result.exitCode, 2, 'a bad flag is not a verdict');
  assert.match(result.stderr, /between 0 and 100/);
});
