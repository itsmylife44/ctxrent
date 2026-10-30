import type { SessionSummary } from './model.ts';
import { prescribe } from './prescriptions.ts';

export type Lever = 'instruction' | 'configuration';

export type Teaching = {
  id: string;
  advice: string;
  lever: Lever;
  saving: number;
  claims: number;
  sessions: number;
  example: string;
};

export type TeachOptions = {
  minSessions: number;
};

const LEVERS: Record<string, Lever> = {
  'read-via-read-tool': 'instruction',
  'uncapped-diff': 'instruction',
  'refetch-remote': 'instruction',
  'search-via-grep-tool': 'instruction',
  'list-heavy': 'instruction',
  'duplicate-context': 'configuration',
  'superseded-read': 'instruction',
  'repeated-command': 'instruction',
  'cap-command-output': 'instruction',
  'attachment-bloat': 'configuration',
};

/**
 * Aggregates what every session says into rules with evidence. A rule only earns a place in the
 * instruction file if it appears in several sessions: one bad afternoon is not a habit.
 */
export function teach(sessions: SessionSummary[], options: TeachOptions): Teaching[] {
  const grouped = new Map<string, Teaching>();

  for (const session of sessions) {
    const advice = prescribe(
      { claims: session.waste, carriers: session.carriers, rent: session.rent },
      10,
    );
    for (const item of advice) {
      const existing = grouped.get(item.id);
      if (existing) {
        existing.saving += item.saving;
        existing.claims += item.claims;
        existing.sessions += 1;
        continue;
      }
      grouped.set(item.id, {
        id: item.id,
        advice: item.advice,
        lever: LEVERS[item.id] ?? 'instruction',
        saving: item.saving,
        claims: item.claims,
        sessions: 1,
        example: item.example,
      });
    }
  }

  return [...grouped.values()]
    .filter((item) => item.sessions >= options.minSessions)
    .sort((a, b) => b.saving - a.saving);
}

export type ManagedRule = { id: string | null; advice: string };

const ID_MARKER = /\s*<!--\s*id:\s*([A-Za-z0-9_-]+)\s*-->\s*$/;

export function composeBlock(rules: ManagedRule[], sessionCount: number): string {
  const lines = [
    '<!-- ctxrent:begin -->',
    '## Context hygiene',
    '',
    `Measured by ctxrent on ${sessionCount.toLocaleString('en-US')} sessions. Each line is a habit that`,
    'recurred across sessions; re-run `ctxrent teach` to update this block.',
    '',
  ];

  for (const rule of rules) {
    lines.push(rule.id === null ? `- ${rule.advice}` : `- ${rule.advice} <!-- id: ${rule.id} -->`);
  }
  lines.push('<!-- ctxrent:end -->');
  return lines.join('\n');
}

export function instructionBlock(
  teachings: Teaching[],
  sessionCount: number,
  selected?: string[],
): string {
  return composeBlock(
    teachings
      .filter(
        (item) =>
          item.lever === 'instruction' && (selected === undefined || selected.includes(item.id)),
      )
      .map((item) => ({ id: item.id, advice: item.advice })),
    sessionCount,
  );
}

/** The rules already written between the markers, so an update never erases what is there. */
export function readManagedRules(existing: string | null): ManagedRule[] {
  if (existing === null) return [];

  const begin = existing.indexOf('<!-- ctxrent:begin -->');
  const end = existing.indexOf('<!-- ctxrent:end -->');
  if (begin < 0 || end <= begin) return [];

  const rules: ManagedRule[] = [];

  for (const line of existing.slice(begin, end).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue;

    const body = trimmed.slice(2).trim();
    if (body === '') continue;

    const marker = ID_MARKER.exec(body);
    rules.push(
      marker === null
        ? { id: null, advice: body }
        : { id: marker[1] ?? null, advice: body.replace(ID_MARKER, '').trim() },
    );
  }

  return rules;
}

/**
 * Matching is by rule id, so a rule the user rewrote keeps their wording instead of being
 * duplicated beside the canonical sentence.
 */
export function mergeRules(existing: ManagedRule[], proposed: ManagedRule[]): ManagedRule[] {
  const key = (rule: ManagedRule): string => rule.id ?? `text:${rule.advice}`;
  const seen = new Set(existing.map(key));
  const merged = [...existing];

  for (const rule of proposed) {
    if (seen.has(key(rule))) continue;
    seen.add(key(rule));
    merged.push(rule);
  }

  return merged;
}

/**
 * Replaces the managed block in place, so teaching twice does not duplicate rules or disturb the
 * user's own writing around it.
 */
export function mergeBlock(existing: string | null, block: string): string {
  const begin = '<!-- ctxrent:begin -->';
  const end = '<!-- ctxrent:end -->';

  if (existing === null || existing.trim() === '') return `${block}\n`;

  const start = existing.indexOf(begin);
  const stop = existing.indexOf(end);

  if (start >= 0 && stop > start) {
    return `${existing.slice(0, start)}${block}${existing.slice(stop + end.length)}`;
  }

  return `${existing.trimEnd()}\n\n${block}\n`;
}
