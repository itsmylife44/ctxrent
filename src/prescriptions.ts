import type { CarrierRent, WasteClaim } from './model.ts';

/**
 * A finding is evidence, not advice: what pattern was observed, how much rent it explains, and the
 * command that caused it. The sentence the user ends up reading is written by their own agent from
 * this evidence, so no wording is baked into the tool.
 */
export type Finding = {
  id: string;
  /** What was observed, stated as data. Not a rule, not an instruction. */
  label: string;
  lever: 'instruction' | 'configuration';
  saving: number;
  claims: number;
  example: string;
};

export type FindingInput = {
  claims: WasteClaim[];
  carriers: CarrierRent[];
  rent: number | null;
};

type Pattern = {
  id: string;
  label: string;
  lever: 'instruction' | 'configuration';
  test: (claim: WasteClaim) => boolean;
};

const PATTERNS: Pattern[] = [
  {
    id: 'read-via-read-tool',
    label: 'files read through Bash (cat, sed, head, tail, awk, nl) instead of the Read tool',
    lever: 'instruction',
    test: (claim) => /^Bash (cat|sed|head|tail|awk|nl)\b/.test(claim.carrier),
  },
  {
    id: 'uncapped-diff',
    label: 'whole diffs printed through Bash (git diff, show, log)',
    lever: 'instruction',
    test: (claim) => /^Bash git (diff|show|log)\b/.test(claim.carrier),
  },
  {
    id: 'refetch-remote',
    label: 'the same issue or pull request fetched again in one session (gh)',
    lever: 'instruction',
    test: (claim) => /^Bash gh \b/.test(claim.carrier),
  },
  {
    id: 'search-via-grep-tool',
    label: 'searches piped through Bash (grep, rg, ag, ack) instead of the Grep tool',
    lever: 'instruction',
    test: (claim) => /^Bash (grep|rg|ag|ack)\b/.test(claim.carrier),
  },
  {
    id: 'list-heavy',
    label: 'directory trees listed through Bash (ls, find, tree)',
    lever: 'instruction',
    test: (claim) => /^Bash (ls|find|tree)\b/.test(claim.carrier),
  },
  {
    id: 'duplicate-context',
    label: 'the same attachment text injected twice inside one context epoch',
    lever: 'configuration',
    test: (claim) => claim.kind === 'duplicate-context',
  },
  {
    id: 'superseded-read',
    label: 'a file read and then rewritten later in the session',
    lever: 'instruction',
    test: (claim) => claim.kind === 'superseded-read',
  },
  {
    id: 'repeated-command',
    label: 'the same command run again within two turns',
    lever: 'instruction',
    test: (claim) => claim.kind === 'retry-loop',
  },
  {
    id: 'cap-command-output',
    label: 'large command output that is never referenced again',
    lever: 'instruction',
    test: (claim) => claim.kind === 'dead-payload',
  },
];

const ALWAYS_ON_MIN_TOKENS = 2000;

function fromCarriers(input: FindingInput): Finding[] {
  if (input.rent === null || input.rent === 0) return [];

  return input.carriers
    .filter((carrier) => carrier.carrier === 'attachment' && carrier.size >= ALWAYS_ON_MIN_TOKENS)
    .map((carrier) => ({
      id: 'attachment-bloat',
      label: 'an attachment re-injected on every turn (hook output, skill listing)',
      lever: 'configuration' as const,
      saving: carrier.rent,
      claims: 1,
      example: `attachment, ${carrier.size.toLocaleString('en-US')} tokens across ${carrier.injections.toLocaleString('en-US')} injections`,
    }));
}

export function findPatterns(input: FindingInput, limit = 3): Finding[] {
  const grouped = new Map<string, Finding>();

  const add = (item: Finding): void => {
    const existing = grouped.get(item.id);
    if (existing) {
      existing.saving += item.saving;
      existing.claims += item.claims;
      return;
    }
    grouped.set(item.id, { ...item });
  };

  for (const claim of input.claims) {
    const pattern = PATTERNS.find((candidate) => candidate.test(claim));
    if (pattern === undefined) continue;
    add({
      id: pattern.id,
      label: pattern.label,
      lever: pattern.lever,
      saving: claim.rent,
      claims: 1,
      example: claim.carrier,
    });
  }

  for (const item of fromCarriers(input)) add(item);

  return [...grouped.values()].sort((a, b) => b.saving - a.saving).slice(0, limit);
}
