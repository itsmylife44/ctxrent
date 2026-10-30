import type { Injection, TokenTotals, Turn } from '../model.ts';
import { addTokens } from '../model.ts';
import type { ParseResult } from '../assemble.ts';
import { assembleSession } from '../assemble.ts';
import { charsOf, estimate } from './content.ts';

type Usage = {
  input_tokens?: number;
  cached_input_tokens?: number;
  cache_write_input_tokens?: number;
  output_tokens?: number;
};

type Payload = Record<string, unknown>;

type CodexRecord = {
  type?: string;
  payload?: Payload;
};

/** Codex records one `token_count` per request, so that event closes a turn. */
export function parseCodexSession(text: string, fallbackId: string): ParseResult {
  const calls = new Map<string, string>();
  const turns: Turn[] = [];
  let pending: Injection[] = [];
  let tokens: TokenTotals | null = null;
  let sessionId = fallbackId;
  let records = 0;

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;

    let record: CodexRecord;
    try {
      record = JSON.parse(line) as CodexRecord;
    } catch {
      continue;
    }
    records += 1;

    const payload = record.payload ?? {};

    if (record.type === 'session_meta') {
      const id = payload['session_id'];
      if (typeof id === 'string') sessionId = id;
      continue;
    }

    if (record.type === 'response_item') {
      const kind = payload['type'];

      if (kind === 'message') {
        const role = payload['role'];
        const injectionKind = role === 'user' ? 'user-message' : role === 'developer' ? 'system' : null;
        if (injectionKind === null) continue;

        for (const block of Array.isArray(payload['content']) ? payload['content'] : []) {
          const candidate = (block ?? {}) as Payload;
          pending.push({
            kind: injectionKind,
            carrier: injectionKind === 'system' ? 'developer-context' : 'user',
            path: null,
            ...estimate(charsOf(candidate['text'])),
          });
        }
        continue;
      }

      if (kind === 'function_call' || kind === 'custom_tool_call') {
        const callId = payload['call_id'];
        const name = payload['name'];
        if (typeof callId === 'string' && typeof name === 'string') calls.set(callId, name);
        continue;
      }

      if (kind === 'function_call_output' || kind === 'custom_tool_call_output') {
        const callId = payload['call_id'];
        const carrier =
          typeof callId === 'string' ? (calls.get(callId) ?? 'unknown-tool') : 'unknown-tool';
        pending.push({
          kind: 'tool-result',
          carrier,
          path: null,
          ...estimate(charsOf(payload['output'])),
        });
        continue;
      }

      continue;
    }

    if (record.type === 'event_msg' && payload['type'] === 'token_count') {
      const info = (payload['info'] ?? {}) as Payload;
      const usage = (info['last_token_usage'] ?? null) as Usage | null;

      turns.push({
        index: turns.length + 1,
        messageId: `codex-turn-${turns.length + 1}`,
        contextTokens: usage?.input_tokens ?? null,
        outputTokens: usage?.output_tokens ?? null,
        injections: pending,
        toolCalls: [],
        attribution: null,
      });
      pending = [];

      if (usage) {
        const input = usage.input_tokens ?? 0;
        const cacheRead = usage.cached_input_tokens ?? 0;
        const cacheCreation = usage.cache_write_input_tokens ?? 0;
        const output = usage.output_tokens ?? 0;
        const partial: TokenTotals = {
          input,
          cacheRead,
          cacheCreation,
          output,
          total: input + output,
        };
        tokens = tokens === null ? partial : addTokens(tokens, partial);
      }
    }
  }

  return {
    session: assembleSession({ sessionId, adapter: 'codex', turns, tokens }),
    records,
  };
}
