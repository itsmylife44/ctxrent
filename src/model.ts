export type AdapterId = 'claude-code' | 'codex';

export type TokenTotals = {
  input: number;
  cacheRead: number;
  cacheCreation: number;
  output: number;
  total: number;
};

export type SessionSummary = {
  sessionId: string;
  adapter: AdapterId;
  turns: number;
  tokens: TokenTotals | null;
};

export type AuditModel = {
  sessions: SessionSummary[];
  totals: {
    turns: number;
    tokens: TokenTotals;
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

  for (const session of sessions) {
    turns += session.turns;
    if (session.tokens === null) continue;
    measuredSessions += 1;
    tokens = addTokens(tokens, session.tokens);
  }

  return {
    sessions,
    totals: {
      turns,
      tokens,
      measuredSessions,
      unmeasuredSessions: sessions.length - measuredSessions,
    },
  };
}
