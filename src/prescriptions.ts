import type { CarrierRent, WasteClaim } from './model.ts';

export type Prescription = {
  id: string;
  saving: number;
  claims: number;
  advice: string;
  example: string;
};

export type PrescriptionInput = {
  claims: WasteClaim[];
  carriers: CarrierRent[];
  rent: number | null;
};

type Rule = {
  id: string;
  test: (claim: WasteClaim) => boolean;
  advice: string;
};

/**
 * A prescription is a rule plus an amount, matching the documented shape of a recommendation
 * (Lighthouse carries `wastedBytes` per opportunity). Advice is phrased as a line the user can put
 * in AGENTS.md, because the user cannot stop an agent from running a command — only steer it.
 */
const RULES: Rule[] = [
  {
    id: 'read-via-read-tool',
    test: (claim) => /^Bash (cat|sed|head|tail|awk|nl)\b/.test(claim.carrier),
    advice: 'Read files with the Read tool (offset/limit), never by piping them through Bash.',
  },
  {
    id: 'uncapped-diff',
    test: (claim) => /^Bash git (diff|show|log)\b/.test(claim.carrier),
    advice: 'Start with `git diff --stat`, then open the one file you need; cap any diff you print.',
  },
  {
    id: 'refetch-remote',
    test: (claim) => /^Bash gh \b/.test(claim.carrier),
    advice: 'Do not re-fetch an issue or pull request you have already read in this session.',
  },
  {
    id: 'search-via-grep-tool',
    test: (claim) => /^Bash (grep|rg|ag|ack)\b/.test(claim.carrier),
    advice:
      'Search with the Grep tool, which returns a bounded result, instead of piping grep through Bash.',
  },
  {
    id: 'list-heavy',
    test: (claim) => /^Bash (ls|find|tree)\b/.test(claim.carrier),
    advice: 'List a directory once, with a depth limit, instead of re-listing trees.',
  },
  {
    id: 'duplicate-context',
    test: (claim) => claim.kind === 'duplicate-context',
    advice: 'Stop re-injecting an attachment that is already in the context verbatim.',
  },
  {
    id: 'superseded-read',
    test: (claim) => claim.kind === 'superseded-read',
    advice: 'Read a file after editing it, or read only the section you are about to change.',
  },
  {
    id: 'repeated-command',
    test: (claim) => claim.kind === 'retry-loop',
    advice: 'Check a command before re-running it; each retry keeps paying rent on its own failure.',
  },
  {
    id: 'cap-command-output',
    test: (claim) => claim.kind === 'dead-payload',
    advice:
      'Cap what a command prints: pipe it through head, or write it to a file and read only the part you need.',
  },
];

const ALWAYS_ON_MIN_TOKENS = 2000;

/**
 * Advice also comes from carriers, not only from waste: a large always-on attachment is the
 * biggest rent line in real sessions and never produces a waste claim, because nothing about it
 * stopped being useful — it is simply always there.
 */
function fromCarriers(input: PrescriptionInput): Prescription[] {
  if (input.rent === null || input.rent === 0) return [];

  return input.carriers
    .filter((carrier) => carrier.carrier === 'attachment' && carrier.size >= ALWAYS_ON_MIN_TOKENS)
    .map((carrier) => ({
      id: 'attachment-bloat',
      saving: carrier.rent,
      claims: 1,
      advice:
        'Move fixed context into a file the agent reads on demand, not an always-on attachment.',
      example: `attachment, ${carrier.size.toLocaleString('en-US')} tokens across ${carrier.injections.toLocaleString('en-US')} injections`,
    }));
}

export function prescribe(input: PrescriptionInput, limit = 3): Prescription[] {
  const grouped = new Map<string, Prescription>();

  const add = (item: Prescription): void => {
    const existing = grouped.get(item.id);
    if (existing) {
      existing.saving += item.saving;
      existing.claims += item.claims;
      return;
    }
    grouped.set(item.id, { ...item });
  };

  for (const claim of input.claims) {
    const rule = RULES.find((candidate) => candidate.test(claim));
    if (rule === undefined) continue;
    add({
      id: rule.id,
      saving: claim.rent,
      claims: 1,
      advice: rule.advice,
      example: claim.carrier,
    });
  }

  for (const item of fromCarriers(input)) add(item);

  return [...grouped.values()].sort((a, b) => b.saving - a.saving).slice(0, limit);
}

/** The same line, shaped for AGENTS.md. */
export function instruction(prescription: Prescription): string {
  return `- ${prescription.advice}`;
}
