import type { AuditModel, SessionSummary, WasteKind } from '../model.ts';

const WIDTH = 80;
const LIST_LIMIT = 20;
const numbers = new Intl.NumberFormat('en-US');

const WASTE_ORDER: WasteKind[] = ['superseded-read', 'dead-payload', 'retry-loop'];

export function renderText(model: AuditModel): string {
  const single = model.sessions.length === 1 ? model.sessions[0] : undefined;
  return single ? renderSession(single) : `${renderList(model)}\n${renderTotals(model)}\n`;
}

function renderSession(session: SessionSummary): string {
  const lines: string[] = [];

  lines.push(truncate(`session ${session.sessionId}`, WIDTH));
  lines.push(metricLine(session));
  lines.push('');
  lines.push(`rent ${rentLabel(session.rent)}   score ${scoreLabel(session.rentScore)}/100`);
  lines.push('');

  lines.push('top carriers');
  if (session.carriers.length === 0) {
    lines.push('  none measurable');
  } else {
    for (const carrier of session.carriers.slice(0, 5)) {
      lines.push(
        carrierLine(carrier.carrier, carrier.rent, carrier.size, carrier.firstTurn, carrier.lastTurn, carrier.injections),
      );
    }
  }
  lines.push('');

  lines.push(wasteHeading(session));
  for (const kind of WASTE_ORDER) {
    const claims = session.waste.filter((claim) => claim.kind === kind);
    if (claims.length === 0) continue;
    const rent = claims.reduce((sum, claim) => sum + claim.rent, 0);
    lines.push(`  ${kind.padEnd(18)}${numbers.format(rent).padStart(10)}   ${claims.length} claim(s)`);
    for (const claim of claims.slice(0, 3)) {
      lines.push(truncate(`    ${claim.carrier} — ${claim.reason}`, WIDTH));
    }
  }
  if (session.wasteRent === null) lines.push('  unavailable: the record does not say enough to classify');
  else if (session.waste.length === 0) lines.push('  none');

  if (session.skills !== null && session.skills.length > 0) {
    lines.push('');
    lines.push('skills and mcp tools');
    for (const skill of session.skills.slice(0, 5)) {
      lines.push(
        `  ${truncate(skill.name, 44).padEnd(44)}${numbers.format(skill.rent).padStart(10)} rent`,
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

function metricLine(session: SessionSummary): string {
  const parts = [`${session.turns.length} turns`];

  if (session.tokens === null) parts.push('tokens unavailable');
  else parts.push(`${numbers.format(session.tokens.total)} tokens spent`);

  if (session.coverage !== null) {
    parts.push(`${Math.round(100 * session.coverage)}% of context accounted for`);
  }
  if (session.unknownInjections > 0) parts.push(`${session.unknownInjections} unmeasurable`);

  return truncate(parts.join(' · '), WIDTH);
}

function rentLabel(rent: number | null): string {
  return rent === null ? 'unavailable' : `${numbers.format(rent)} token-turns`;
}

function scoreLabel(score: number | null): string {
  return score === null ? '–' : String(score);
}

function wasteHeading(session: SessionSummary): string {
  if (session.wasteRent === null) return 'waste';
  if (session.rent === null || session.rent === 0) {
    return `waste ${numbers.format(session.wasteRent)} token-turns`;
  }
  const share = Math.round((100 * session.wasteRent) / session.rent);
  return `waste ${numbers.format(session.wasteRent)} token-turns (${share}% of rent)`;
}

function carrierLine(
  carrier: string,
  rent: number,
  size: number,
  firstTurn: number,
  lastTurn: number,
  injections: number,
): string {
  const name = truncate(carrier, 32).padEnd(32);
  const span = `t${firstTurn}–${lastTurn}${injections > 1 ? ` ×${injections}` : ''}`;
  return `  ${name}${numbers.format(rent).padStart(9)} rent${numbers.format(size).padStart(8)} tok ${span.padStart(11)}`;
}

function renderList(model: AuditModel): string {
  const ranked = [...model.sessions].sort((a, b) => (b.rent ?? -1) - (a.rent ?? -1));
  const shown = ranked.slice(0, LIST_LIMIT);

  const lines = shown.map((session) => {
    const spend =
      session.tokens === null ? 'tokens unmeasured' : `${numbers.format(session.tokens.total)} tok`;
    const rent = session.rent === null ? 'unavailable' : numbers.format(session.rent);
    return truncate(
      `${session.sessionId.padEnd(38)}${String(session.turns.length).padStart(4)}t · rent ${rent} · ${spend}`,
      WIDTH,
    );
  });

  if (ranked.length > shown.length) {
    lines.push(`  … and ${numbers.format(ranked.length - shown.length)} more sessions by rent`);
  }

  return lines.join('\n');
}

function renderTotals(model: AuditModel): string {
  const lines = [
    '',
    `sessions ${model.sessions.length} · turns ${numbers.format(model.totals.turns)} · tokens ${numbers.format(model.totals.tokens.total)}`,
    `rent ${rentLabel(model.totals.rent)} · score ${scoreLabel(model.totals.rentScore)}/100 · waste ${model.totals.wasteRent === null ? 'unavailable' : numbers.format(model.totals.wasteRent)}`,
    `coverage: ${model.totals.measuredSessions} sessions with usage, ${model.totals.unmeasuredSessions} without, ${model.totals.sessionsWithRent} with rent`,
    `          ${numbers.format(model.totals.unknownInjections)} unmeasurable injections`,
  ];
  return lines.map((line) => truncate(line, WIDTH)).join('\n');
}

function truncate(text: string, width: number): string {
  if (text.length <= width) return text;
  return `${text.slice(0, width - 1)}…`;
}
