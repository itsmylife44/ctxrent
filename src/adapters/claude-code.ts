import type { Injection, InjectionKind, TokenTotals, Turn } from '../model.ts';
import { addTokens } from '../model.ts';
import type { ParseResult } from '../assemble.ts';
import { assembleSession } from '../assemble.ts';
import { asBlocks, carrierOf, charsOf, estimate, hashOf, textOf } from './content.ts';

const READ_TOOL = 'Read';

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
  attributionSkill?: unknown;
  attributionMcpTool?: unknown;
  message?: { id?: string; usage?: Usage; content?: unknown };
};

export function parseClaudeCodeSession(text: string, fallbackId: string): ParseResult {
  const seenMessages = new Set<string>();
  const toolUses = new Map<string, { name: string; input: Block | null }>();

  let pending: Injection[] = [];
  const turns: Turn[] = [];
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

    if (typeof record.sessionId === 'string' && record.sessionId !== '') sessionId = record.sessionId;

    if (record.type === 'assistant') {
      const message = record.message;
      if (!message) continue;

      let turn: Turn | undefined;
      if (message.id && !seenMessages.has(message.id)) {
        seenMessages.add(message.id);
        const usage = message.usage;
        const contextTokens = usage
          ? (usage.input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0)
          : null;

        turn = {
          index: turns.length + 1,
          messageId: message.id,
          contextTokens,
          outputTokens: usage?.output_tokens ?? null,
          injections: pending,
          toolCalls: [],
          attribution: {
            skill: typeof record.attributionSkill === 'string' ? record.attributionSkill : null,
            mcpTool: typeof record.attributionMcpTool === 'string' ? record.attributionMcpTool : null,
          },
        };
        turns.push(turn);
        pending = [];

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
      } else {
        turn = turns.find((candidate) => candidate.messageId === message.id);
      }

      for (const block of asBlocks(message.content)) {
        if (block.type !== 'tool_use' || typeof block.id !== 'string') continue;
        const name = typeof block.name === 'string' ? block.name : 'unknown-tool';
        const input =
          block.input !== null && typeof block.input === 'object' ? (block.input as Block) : null;
        toolUses.set(block.id, { name, input });
        turn?.toolCalls.push({ name, input });
      }
      continue;
    }

    if (record.type === 'user') {
      const content = record.message?.content;
      if (content === undefined || content === null) continue;

      const blocks = Array.isArray(content) ? content : [{ type: 'text', text: content }];

      for (const raw of blocks) {
        const candidate = (raw ?? {}) as Block;

        if (candidate.type === 'tool_result') {
          const tool =
            typeof candidate.tool_use_id === 'string'
              ? toolUses.get(candidate.tool_use_id)
              : undefined;
          const path = tool?.input?.['file_path'];
          const isRead = tool?.name === READ_TOOL;
          const kind: InjectionKind = isRead ? 'file-read' : 'tool-result';
          const injectionPath = isRead && typeof path === 'string' ? path : null;

          pending.push({
            kind,
            carrier: carrierOf(tool?.name ?? 'unknown-tool', tool?.input ?? null),
            path: injectionPath,
            contentHash: null,
            ...estimate(charsOf(candidate.content)),
          });
          continue;
        }

        if (candidate.type === 'text') {
          pending.push({
            kind: 'user-message',
            carrier: 'user',
            path: null,
            contentHash: null,
            ...estimate(charsOf(candidate.text)),
          });
        }
      }
      continue;
    }

    if (record.type === 'attachment') {
      const text = textOf(record.rendered) ?? textOf(record.attachment);
      pending.push({
        kind: 'attachment',
        carrier: 'attachment',
        path: null,
        contentHash: hashOf(text),
        ...estimate(text === null ? null : text.length),
      });
      continue;
    }

    if (record.type === 'system' && record.content !== undefined) {
      pending.push({
        kind: 'system',
        carrier: 'system',
        path: null,
        contentHash: null,
        ...estimate(charsOf(record.content)),
      });
    }
  }

  return {
    session: assembleSession({ sessionId, adapter: 'claude-code', turns, tokens }),
    records,
  };
}
