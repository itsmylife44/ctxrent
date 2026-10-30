import type { Injection, InjectionKind, SessionSummary, TokenTotals, Turn } from '../model.ts';
import { addTokens } from '../model.ts';

const CHARS_PER_TOKEN = 4;

type Usage = {
  input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  output_tokens?: number;
};

type Block = Record<string, unknown>;

type LogRecord = {
  type?: string;
  sessionId?: string;
  content?: unknown;
  rendered?: unknown;
  attachment?: unknown;
  message?: { id?: string; usage?: Usage; content?: unknown };
};

export type ParseResult = {
  session: SessionSummary;
  records: number;
};

/** Recovers the number of characters in a piece of recorded content, or null when there is no text to recover. */
function charsOf(value: unknown): number | null {
  if (typeof value === 'string') return value.length;

  if (Array.isArray(value)) {
    let total = 0;
    for (const item of value) {
      const chars = charsOf(item);
      if (chars === null) return null;
      total += chars;
    }
    return total;
  }

  if (value !== null && typeof value === 'object') {
    const object = value as Block;
    let sawText = false;
    for (const key of ['text', 'thinking', 'rendered', 'content']) {
      const field = object[key];
      if (typeof field !== 'string') continue;
      sawText = true;
      if (field.length > 0) return field.length;
    }
    return sawText ? 0 : null;
  }

  return null;
}

function estimate(chars: number | null): Pick<Injection, 'size' | 'sizeMethod'> {
  if (chars === null) return { size: null, sizeMethod: 'unknown' };
  return { size: Math.ceil(chars / CHARS_PER_TOKEN), sizeMethod: 'estimated' };
}

export function parseClaudeCodeSession(text: string, fallbackId: string): ParseResult {
  const seenMessages = new Set<string>();
  const toolUses = new Map<string, { name: string; input: Block | null }>();

  let pending: Injection[] = [];
  const turns: Turn[] = [];
  let tokens: TokenTotals | null = null;
  let lastContextTokens: number | null = null;
  let sessionId = fallbackId;
  let records = 0;

  const inject = (injection: Injection): void => {
    pending.push(injection);
  };

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;

    let record: LogRecord;
    try {
      record = JSON.parse(line) as LogRecord;
    } catch {
      continue;
    }
    records += 1;

    if (record.sessionId) sessionId = record.sessionId;

    if (record.type === 'assistant') {
      const message = record.message;
      if (!message) continue;

      if (message.id && !seenMessages.has(message.id)) {
        seenMessages.add(message.id);
        const usage = message.usage;
        const contextTokens = usage
          ? (usage.input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0)
          : null;

        turns.push({
          index: turns.length + 1,
          messageId: message.id,
          contextTokens,
          outputTokens: usage?.output_tokens ?? null,
          injections: pending,
        });
        pending = [];
        lastContextTokens = contextTokens;

        if (usage) {
          const input = usage.input_tokens ?? 0;
          const cacheRead = usage.cache_read_input_tokens ?? 0;
          const cacheCreation = usage.cache_creation_input_tokens ?? 0;
          const output = usage.output_tokens ?? 0;
          const partial: TokenTotals = {
            input,
            cacheRead,
            cacheCreation,
            output,
            total: input + cacheRead + cacheCreation + output,
          };
          tokens = tokens === null ? partial : addTokens(tokens, partial);
        }
      }

      for (const block of Array.isArray(message.content) ? message.content : []) {
        const candidate = block as Block;
        if (candidate.type !== 'tool_use' || typeof candidate.id !== 'string') continue;
        toolUses.set(candidate.id, {
          name: typeof candidate.name === 'string' ? candidate.name : 'unknown-tool',
          input:
            candidate.input !== null && typeof candidate.input === 'object'
              ? (candidate.input as Block)
              : null,
        });
      }
      continue;
    }

    if (record.type === 'user') {
      const content = record.message?.content;
      if (content === undefined || content === null) continue;

      const blocks = Array.isArray(content) ? content : [{ type: 'text', text: content }];

      for (const block of blocks) {
        const candidate = (block ?? {}) as Block;

        if (candidate.type === 'tool_result') {
          const tool =
            typeof candidate.tool_use_id === 'string'
              ? toolUses.get(candidate.tool_use_id)
              : undefined;
          const path = tool?.input?.['file_path'];
          const kind: InjectionKind = tool?.name === 'Read' ? 'file-read' : 'tool-result';
          const carrier =
            kind === 'file-read'
              ? `Read ${typeof path === 'string' ? path : '(unknown path)'}`
              : (tool?.name ?? 'unknown-tool');
          inject({ kind, carrier, ...estimate(charsOf(candidate.content)) });
          continue;
        }

        if (candidate.type === 'text') {
          inject({
            kind: 'user-message',
            carrier: 'user',
            ...estimate(charsOf(candidate.text)),
          });
        }
      }
      continue;
    }

    if (record.type === 'attachment') {
      const chars = charsOf(record.rendered) ?? charsOf(record.attachment);
      inject({ kind: 'attachment', carrier: 'attachment', ...estimate(chars) });
      continue;
    }

    if (record.type === 'system' && record.content !== undefined) {
      inject({ kind: 'system', carrier: 'system', ...estimate(charsOf(record.content)) });
    }
  }

  let injectionCount = 0;
  let measuredInjections = 0;
  let unknownInjections = 0;
  let measuredTokens = 0;

  for (const turn of turns) {
    for (const injection of turn.injections) {
      injectionCount += 1;
      if (injection.size === null) {
        unknownInjections += 1;
        continue;
      }
      measuredInjections += 1;
      measuredTokens += injection.size;
    }
  }

  const injectedTokens =
    injectionCount === 0 ? 0 : measuredInjections === 0 ? null : measuredTokens;

  const residualContextTokens =
    lastContextTokens === null || injectedTokens === null
      ? null
      : lastContextTokens - injectedTokens;

  return {
    session: {
      sessionId,
      adapter: 'claude-code',
      turns,
      tokens,
      injectedTokens,
      injectionCount,
      unknownInjections,
      residualContextTokens,
    },
    records,
  };
}
