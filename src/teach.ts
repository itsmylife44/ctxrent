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

export function instructionBlock(
  teachings: Teaching[],
  sessionCount: number,
  selected?: string[],
): string {
  const rules = teachings.filter(
    (item) => item.lever === 'instruction' && (selected === undefined || selected.includes(item.id)),
  );
  const lines = [
    '<!-- ctxrent:begin -->',
    '## Context hygiene',
    '',
    `Measured by ctxrent on ${sessionCount.toLocaleString('en-US')} sessions. Each line is a habit that`,
    'recurred across sessions; re-run `ctxrent teach` to update this block.',
    '',
  ];

  for (const rule of rules) {
    lines.push(`- ${rule.advice}`);
  }

  lines.push('<!-- ctxrent:end -->');
  return lines.join('\n');
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
