import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openFor, shellFor } from '../src/deps.ts';

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
  const win = openFor('win32', 'http://127.0.0.1:1/t');
  assert.equal(win.file, 'cmd.exe');
  assert.match(win.args.join(' '), /^\/d \/s \/c start "" "http:\/\/127\.0\.0\.1:1\/t"$/);
});
