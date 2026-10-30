import type { SessionSummary, TokenTotals } from '../model.ts';
import { addTokens } from '../model.ts';

type Usage = {
  input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  output_tokens?: number;
};

type LogRecord = {
  type?: string;
  sessionId?: string;
  message?: { id?: string; usage?: Usage };
};

export type ParseResult = {
  session: SessionSummary;
  records: number;
};

export function parseClaudeCodeSession(text: string, fallbackId: string): ParseResult {
  const seen = new Set<string>();
  let tokens: TokenTotals | null = null;
  let sessionId = fallbackId;
  let records = 0;

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
    if (record.type !== 'assistant') continue;

    const message = record.message;
    if (!message?.id) continue;

    if (seen.has(message.id)) continue;
    seen.add(message.id);

    const usage = message.usage;
    if (!usage) continue;

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

  return {
    session: { sessionId, adapter: 'claude-code', turns: seen.size, tokens },
    records,
  };
}
