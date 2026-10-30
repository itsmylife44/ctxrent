import type { Injection } from '../model.ts';

export const CHARS_PER_TOKEN = 4;

type Block = Record<string, unknown>;

/** Recovers the number of characters in a piece of recorded content, or null when there is no text to recover. */
export function charsOf(value: unknown): number | null {
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

export function estimate(chars: number | null): Pick<Injection, 'size' | 'sizeMethod'> {
  if (chars === null) return { size: null, sizeMethod: 'unknown' };
  return { size: Math.ceil(chars / CHARS_PER_TOKEN), sizeMethod: 'estimated' };
}

/**
 * A carrier names the thing that caused the injection, precisely enough to tell two calls of the
 * same tool apart: `Bash npm test` is not `Bash git status`.
 */
export function carrierOf(name: string, input: Block | null): string {
  if (input === null) return name;

  for (const key of ['file_path', 'command', 'pattern', 'query', 'url']) {
    const value = input[key];
    if (typeof value === 'string' && value.length > 0) return `${name} ${value}`;
  }

  return name;
}

export function asBlocks(content: unknown): Block[] {
  if (!Array.isArray(content)) return [];
  return content.map((block) => (block ?? {}) as Block);
}
