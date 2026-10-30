import type { SessionSummary } from './model.ts';
import { findPatterns } from './prescriptions.ts';

export type Lever = 'instruction' | 'configuration';

export type Teaching = {
  id: string;
  /** What was observed. Data, not a rule: the sentence is written later by the agent. */
  label: string;
  lever: Lever;
  saving: number;
  claims: number;
  sessions: number;
  example: string;
};

export type TeachOptions = {
  minSessions: number;
};

/**
 * Aggregates what every session observed into findings with evidence. A finding only earns a place
 * if it appears in several sessions: one bad afternoon is not a habit.
 */
export function teach(sessions: SessionSummary[], options: TeachOptions): Teaching[] {
  const grouped = new Map<string, Teaching>();

  for (const session of sessions) {
    const found = findPatterns(
      { claims: session.waste, carriers: session.carriers, rent: session.rent },
      10,
    );
    for (const item of found) {
      const existing = grouped.get(item.id);
      if (existing) {
        existing.saving += item.saving;
        existing.claims += item.claims;
        existing.sessions += 1;
        continue;
      }
      grouped.set(item.id, {
        id: item.id,
        label: item.label,
        lever: item.lever,
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

/**
 * Before e1480d0 ctxrent wrote these sentences itself, with no id marker. Recognising them keeps an
 * old block from collecting a second, id-marked copy of every rule.
 */
const LEGACY_IDS = new Map<string, string>([
  ['Read files with the Read tool (offset/limit), never by piping them through Bash.', 'read-via-read-tool'],
  ['Start with `git diff --stat`, then open the one file you need; cap any diff you print.', 'uncapped-diff'],
  ['Do not re-fetch an issue or pull request you have already read in this session.', 'refetch-remote'],
  [
    'Search with the Grep tool, which returns a bounded result, instead of piping grep through Bash.',
    'search-via-grep-tool',
  ],
  ['List a directory once, with a depth limit, instead of re-listing trees.', 'list-heavy'],
  ['Stop re-injecting an attachment that is already in the context verbatim.', 'duplicate-context'],
  ['Read a file after editing it, or read only the section you are about to change.', 'superseded-read'],
  ['Check a command before re-running it; each retry keeps paying rent on its own failure.', 'repeated-command'],
  [
    'Cap what a command prints: pipe it through head, or write it to a file and read only the part you need.',
    'cap-command-output',
  ],
  ['Move fixed context into a file the agent reads on demand, not an always-on attachment.', 'attachment-bloat'],
]);

export function composeBlock(rules: ManagedRule[], sessionCount: number, date: string): string {
  const lines = [
    '<!-- ctxrent:begin -->',
    '## Context hygiene',
    '',
    `Measured by ctxrent on ${sessionCount.toLocaleString('en-US')} sessions, applied ${date}. Each line`,
    'was written from that evidence; run /ctxrent or `ctxrent review` to update this block.',
    '',
  ];

  for (const rule of rules) {
    lines.push(rule.id === null ? `- ${rule.advice}` : `- ${rule.advice} <!-- id: ${rule.id} -->`);
  }
  lines.push('<!-- ctxrent:end -->');
  return lines.join('\n');
}

/** The rules already written between the markers, so an update never erases what is there. */
export function readManagedRules(existing: string | null): ManagedRule[] {
  if (existing === null) return [];

  const begin = existing.indexOf('<!-- ctxrent:begin -->');
  const end = existing.indexOf('<!-- ctxrent:end -->');
  if (begin < 0 || end <= begin) return [];

  const rules: (ManagedRule & { legacy: boolean })[] = [];

  for (const line of existing.slice(begin, end).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue;

    const body = trimmed.slice(2).trim();
    if (body === '') continue;

    const marker = ID_MARKER.exec(body);
    rules.push(
      marker === null
        ? { id: LEGACY_IDS.get(body) ?? null, advice: body, legacy: true }
        : { id: marker[1] ?? null, advice: body.replace(ID_MARKER, '').trim(), legacy: false },
    );
  }

  // An old sentence gives way to a rule that carries the same id explicitly.
  const explicit = new Set(rules.filter((rule) => !rule.legacy).map((rule) => rule.id));
  return rules
    .filter((rule) => !rule.legacy || rule.id === null || !explicit.has(rule.id))
    .map(({ id, advice }) => ({ id, advice }));
}

/**
 * Matching is by rule id, so a rule the user rewrote keeps their wording instead of being
 * duplicated beside a second version.
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
