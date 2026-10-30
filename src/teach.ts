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

export function composeBlock(advices: string[], sessionCount: number): string {
  const lines = [
    '<!-- ctxrent:begin -->',
    '## Context hygiene',
    '',
    `Measured by ctxrent on ${sessionCount.toLocaleString('en-US')} sessions. Each line is a habit that`,
    'recurred across sessions; re-run `ctxrent teach` to update this block.',
    '',
  ];

  for (const advice of advices) lines.push(`- ${advice}`);
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
      .map((item) => item.advice),
    sessionCount,
  );
}

/** The rules already written between the markers, so an update never erases what is there. */
export function readManagedRules(existing: string | null): string[] {
  if (existing === null) return [];

  const begin = existing.indexOf('<!-- ctxrent:begin -->');
  const end = existing.indexOf('<!-- ctxrent:end -->');
  if (begin < 0 || end <= begin) return [];

  return existing
    .slice(begin, end)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0);
}

export function mergeRules(existing: string[], proposed: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const advice of [...existing, ...proposed]) {
    if (seen.has(advice)) continue;
    seen.add(advice);
    merged.push(advice);
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
