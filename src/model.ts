export type AdapterId = 'claude-code' | 'codex';

export const SCORE_MAX = 100;

export type TokenTotals = {
  input: number;
  cacheRead: number;
  cacheCreation: number;
  output: number;
  total: number;
};

export type InjectionKind =
  | 'user-message'
  | 'tool-result'
  | 'file-read'
  | 'attachment'
  | 'system';

export type Injection = {
  kind: InjectionKind;
  carrier: string;
  path: string | null;
  contentHash: string | null;
  size: number | null;
  sizeMethod: 'estimated' | 'unknown';
};

export type ToolCall = {
  name: string;
  input: Record<string, unknown> | null;
};

export type Attribution = {
  skill: string | null;
  mcpTool: string | null;
};

export type Turn = {
  index: number;
  messageId: string;
  contextTokens: number | null;
  outputTokens: number | null;
  injections: Injection[];
  toolCalls: ToolCall[];
  attribution: Attribution | null;
};

export type CarrierRent = {
  carrier: string;
  kind: InjectionKind;
  size: number;
  rent: number;
  firstTurn: number;
  lastTurn: number;
  injections: number;
};

export type SkillRent = {
  name: string;
  kind: 'skill' | 'mcp-tool';
  rent: number;
};

export type WasteKind =
  | 'superseded-read'
  | 'dead-payload'
  | 'retry-loop'
  | 'duplicate-context';

export type WasteClaim = {
  kind: WasteKind;
  carrier: string;
  rent: number;
  turns: number[];
  reason: string;
};

export type SessionSummary = {
  sessionId: string;
  adapter: AdapterId;
  turns: Turn[];
  tokens: TokenTotals | null;
  injectedTokens: number | null;
  injectionCount: number;
  unknownInjections: number;
  coverage: number | null;
  residualContextTokens: number | null;
  rent: number | null;
  rentScore: number | null;
  carriers: CarrierRent[];
  skills: SkillRent[] | null;
  waste: WasteClaim[];
  wasteRent: number | null;
};

export type AuditModel = {
  sessions: SessionSummary[];
  totals: {
    turns: number;
    tokens: TokenTotals;
    injectedTokens: number;
    unknownInjections: number;
    rent: number | null;
    rentScore: number | null;
    wasteRent: number | null;
    /** Rent of the sessions whose waste could be judged: the only fair denominator for waste. */
    assessedRent: number | null;
    measuredSessions: number;
    unmeasuredSessions: number;
    sessionsWithRent: number;
  };
};

export function emptyTokens(): TokenTotals {
  return { input: 0, cacheRead: 0, cacheCreation: 0, output: 0, total: 0 };
}

export function addTokens(a: TokenTotals, b: TokenTotals): TokenTotals {
  return {
    input: a.input + b.input,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheCreation: a.cacheCreation + b.cacheCreation,
    output: a.output + b.output,
    total: a.total + b.total,
  };
}

/** The score is the share of rent that is not waste, so it compares sessions of any length. */
export function scoreOf(rent: number | null, wasteRent: number | null): number | null {
  if (rent === null || rent <= 0) return null;
  if (wasteRent === null) return null;
  return Math.min(SCORE_MAX, Math.round(SCORE_MAX * (1 - wasteRent / rent)));
}

export function summariseSessions(sessions: SessionSummary[]): AuditModel {
  let tokens: TokenTotals = emptyTokens();
  let turns = 0;
  let measuredSessions = 0;
  let injectedTokens = 0;
  let unknownInjections = 0;
  let rent = 0;
  let wasteRent = 0;
  let assessedRent = 0;
  let sessionsWithRent = 0;
  let assessedSessions = 0;

  for (const session of sessions) {
    turns += session.turns.length;
    injectedTokens += session.injectedTokens ?? 0;
    unknownInjections += session.unknownInjections;
    if (session.rent !== null) {
      rent += session.rent;
      sessionsWithRent += 1;
      if (session.wasteRent !== null) {
        wasteRent += session.wasteRent;
        assessedRent += session.rent;
        assessedSessions += 1;
      }
    }
    if (session.tokens === null) continue;
    measuredSessions += 1;
    tokens = addTokens(tokens, session.tokens);
  }

  return {
    sessions,
    totals: {
      turns,
      tokens,
      injectedTokens,
      unknownInjections,
      rent: sessionsWithRent === 0 ? null : rent,
      rentScore: scoreOf(assessedSessions === 0 ? null : assessedRent, assessedSessions === 0 ? null : wasteRent),
      wasteRent: assessedSessions === 0 ? null : wasteRent,
      assessedRent: assessedSessions === 0 ? null : assessedRent,
      measuredSessions,
      unmeasuredSessions: sessions.length - measuredSessions,
      sessionsWithRent,
    },
  };
}
