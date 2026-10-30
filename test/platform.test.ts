import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileInvocation, openFor, quoteWindowsArgument, shellFor } from '../src/deps.ts';
import { runnerInvocation } from '../src/runner.ts';

test('a shell command is run through cmd on windows and sh elsewhere', () => {
  assert.deepEqual(shellFor('win32', 'claude -p "hi"'), {
    file: 'cmd.exe',
    args: ['/d', '/s', '/c', 'claude -p "hi"'],
  });
  assert.deepEqual(shellFor('darwin', 'claude -p "hi"'), {
    file: 'sh',
    args: ['-c', 'claude -p "hi"'],
  });
  assert.equal(shellFor('linux', 'x').file, 'sh');
});

test('a url is handed to the right opener per platform', () => {
  assert.deepEqual(openFor('darwin', 'http://127.0.0.1:1/t'), {
    file: 'open',
    args: ['http://127.0.0.1:1/t'],
  });
  assert.deepEqual(openFor('linux', 'http://127.0.0.1:1/t'), {
    file: 'xdg-open',
    args: ['http://127.0.0.1:1/t'],
  });
  assert.deepEqual(openFor('win32', 'http://127.0.0.1:1/t'), {
    file: 'rundll32.exe',
    args: ['url.dll,FileProtocolHandler', 'http://127.0.0.1:1/t'],
  });
  assert.deepEqual(openFor('win32', 'C:\\Users\\me\\report.html'), {
    file: 'explorer.exe',
    args: ['C:\\Users\\me\\report.html'],
  });
});

test('a program is invoked with argv, never a shell string, off windows', () => {
  assert.deepEqual(fileInvocation('darwin', 'claude', ['-p', 'a b']), {
    file: 'claude',
    args: ['-p', 'a b'],
  });
});

test('on windows the program and its arguments go through cmd with quoting', () => {
  const invocation = fileInvocation('win32', 'claude', ['-p', 'fix the bug']);

  assert.equal(invocation.file, 'cmd.exe');
  assert.deepEqual(invocation.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.equal(invocation.args[3], 'claude -p "fix the bug"');
});

test('windows quoting handles empty and quoted arguments', () => {
  assert.equal(quoteWindowsArgument(''), '""');
  assert.equal(quoteWindowsArgument('plain'), 'plain');
  assert.equal(quoteWindowsArgument('two words'), '"two words"');
  assert.equal(quoteWindowsArgument('say "hi"'), '"say ""hi"""');
});

test('the agent runner is invoked as a program with arguments', () => {
  assert.deepEqual(runnerInvocation('claude', 'do it'), {
    file: 'claude',
    args: ['-p', '--output-format', 'stream-json', '--verbose', 'do it'],
  });
  assert.deepEqual(runnerInvocation('codex', 'do it'), {
    file: 'codex',
    args: ['exec', '--json', 'do it'],
  });
});
