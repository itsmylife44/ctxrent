export type AdapterId = 'claude-code' | 'codex';

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
  size: number | null;
  sizeMethod: 'estimated' | 'unknown';
};

export type Turn = {
  index: number;
  messageId: string;
  contextTokens: number | null;
  outputTokens: number | null;
  injections: Injection[];
};

export type SessionSummary = {
  sessionId: string;
  adapter: AdapterId;
  turns: Turn[];
  tokens: TokenTotals | null;
  injectedTokens: number | null;
  injectionCount: number;
  unknownInjections: number;
  residualContextTokens: number | null;
};

export type AuditModel = {
  sessions: SessionSummary[];
  totals: {
    turns: number;
    tokens: TokenTotals;
    injectedTokens: number;
    unknownInjections: number;
    measuredSessions: number;
    unmeasuredSessions: number;
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

export function summariseSessions(sessions: SessionSummary[]): AuditModel {
  let tokens: TokenTotals = emptyTokens();
  let turns = 0;
  let measuredSessions = 0;
  let injectedTokens = 0;
  let unknownInjections = 0;

  for (const session of sessions) {
    turns += session.turns.length;
    injectedTokens += session.injectedTokens ?? 0;
    unknownInjections += session.unknownInjections;
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
      measuredSessions,
      unmeasuredSessions: sessions.length - measuredSessions,
    },
  };
}
