import type { AdapterId, SessionSummary, TokenTotals, Turn } from './model.ts';
import { scoreOf } from './model.ts';
import { computeRent } from './rent.ts';
import { classifyWaste } from './waste.ts';
import { lastEpochStart } from './epochs.ts';

export type SessionParts = {
  sessionId: string;
  adapter: AdapterId;
  turns: Turn[];
  tokens: TokenTotals | null;
};

export type ParseResult = {
  session: SessionSummary;
  records: number;
};

/** Turns a parsed session into the reported summary: inject totals, coverage, rent, waste, attribution. */
export function assembleSession(parts: SessionParts): SessionSummary {
  const { turns } = parts;

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

  const lastContextTokens =
    [...turns].reverse().find((turn) => turn.contextTokens !== null)?.contextTokens ?? null;

  const epochStart = lastEpochStart(turns);
  let injectedInEpoch = 0;
  for (let index = epochStart; index < turns.length; index += 1) {
    for (const injection of turns[index]?.injections ?? []) {
      if (injection.size !== null) injectedInEpoch += injection.size;
    }
  }

  const comparable = injectedTokens !== null && lastContextTokens !== null;
  const coverage =
    comparable && lastContextTokens > 0
      ? Math.min(1, injectedInEpoch / lastContextTokens)
      : null;
  // The residual is everything the reconstruction cannot account for, including content whose
  // size could not be recovered. It is never clamped: a negative value means over-attribution.
  const residualContextTokens = comparable ? lastContextTokens - injectedInEpoch : null;

  const rent = computeRent(turns);
  const waste = classifyWaste(turns);

  // Waste is only assessable when the record names something a rule can judge: a file read, or a
  // tool result whose carrier identifies the call. Otherwise "no waste found" would be a lie.
  const assessable = waste.length > 0 || turns.some((turn) =>
    turn.injections.some(
      (injection) =>
        injection.kind === 'file-read' ||
        (injection.kind === 'tool-result' && injection.carrier.includes(' ')),
    ),
  );
  const wasteRent =
    rent.rent === null || !assessable ? null : waste.reduce((sum, claim) => sum + claim.rent, 0);

  return {
    sessionId: parts.sessionId,
    adapter: parts.adapter,
    turns,
    tokens: parts.tokens,
    injectedTokens,
    injectionCount,
    unknownInjections,
    coverage,
    residualContextTokens,
    rent: rent.rent,
    rentScore: scoreOf(rent.rent, wasteRent),
    carriers: rent.carriers,
    skills: rent.skills,
    waste,
    wasteRent,
  };
}
