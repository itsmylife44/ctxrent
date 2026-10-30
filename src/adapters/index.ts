import type { ParseResult } from '../assemble.ts';
import { parseClaudeCodeSession } from './claude-code.ts';
import { parseCodexSession } from './codex.ts';

/** Codex logs open with a `session_meta` record; Claude Code logs never contain one. */
function isCodex(text: string, probe = 5): boolean {
  let inspected = 0;

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    if (inspected >= probe) break;
    inspected += 1;

    try {
      const record = JSON.parse(line) as { type?: string };
      if (record.type === 'session_meta' || record.type === 'turn_context') return true;
      if (record.type === 'assistant' || record.type === 'user' || record.type === 'attachment') {
        return false;
      }
    } catch {
      continue;
    }
  }

  return false;
}

export function parseSession(text: string, fallbackId: string): ParseResult {
  return isCodex(text)
    ? parseCodexSession(text, fallbackId)
    : parseClaudeCodeSession(text, fallbackId);
}

