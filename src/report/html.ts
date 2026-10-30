import type { AuditModel, SessionSummary, WasteKind } from '../model.ts';
import { prescribe } from '../prescriptions.ts';

const numbers = new Intl.NumberFormat('en-US');
const WASTE_ORDER: WasteKind[] = [
  'duplicate-context',
  'superseded-read',
  'dead-payload',
  'retry-loop',
];
const AGGREGATE_LIMIT = 100;

export function renderHtml(model: AuditModel): string {
  const single = model.sessions.length === 1 ? model.sessions[0] : undefined;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ctxrent — ${escape(single?.sessionId ?? `${model.sessions.length} sessions`)}</title>
<style>
:root{--bg:#0b0d10;--fg:#e8eaed;--muted:#8b929c;--line:#22262c;--accent:#7ee0a1;--waste:#f2795a}
*{box-sizing:border-box}
body{margin:0;padding:32px;background:var(--bg);color:var(--fg);font:15px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
h1{font-size:16px;font-weight:600;margin:0 0 4px}
h2{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:28px 0 10px}
.sub{color:var(--muted);margin:0 0 24px}
.hero{display:flex;gap:36px;align-items:baseline;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:20px 0}
.hero div{display:flex;flex-direction:column}
.hero b{font-size:30px;font-weight:600}
.hero span{color:var(--muted);font-size:12px}
.row{display:grid;grid-template-columns:minmax(120px,1fr) 3fr 90px;gap:12px;align-items:center;margin:6px 0}
.row .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar{height:8px;background:var(--line);border-radius:4px;overflow:hidden}
.bar i{display:block;height:100%;background:var(--accent)}
.row.waste .bar i{background:var(--waste)}
.val{text-align:right;color:var(--muted);font-size:12px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
th{color:var(--muted);font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
td.num{text-align:right}
footer{margin-top:32px;color:var(--muted);font-size:12px}
</style>
</head>
<body>
<h1>ctxrent</h1>
<p class="sub">${escape(subtitle(model))}</p>
${single ? hero(single) : aggregate(model)}
<footer>Context rent is measured in token-turns: one token occupying the context for one request.</footer>
</body>
</html>
`;
}

function subtitle(model: AuditModel): string {
  if (model.sessions.length === 1) {
    const session = model.sessions[0] as SessionSummary;
    const coverage =
      session.coverage === null
        ? 'coverage unavailable'
        : `${Math.round(100 * session.coverage)}% of context accounted for`;
    return `${session.sessionId} · ${session.turns.length} turns · ${coverage}`;
  }
  return `${model.sessions.length} sessions · ${numbers.format(model.totals.turns)} turns`;
}

function hero(session: SessionSummary): string {
  return `<section class="hero">
  <div><b>${value(session.rent)}</b><span>token-turns of rent</span></div>
  <div><b>${session.rentScore ?? '–'}</b><span>score out of 100</span></div>
  <div><b>${value(session.wasteRent)}</b><span>token-turns of waste</span></div>
  <div><b>${session.turns.length}</b><span>turns</span></div>
</section>
${whatToChange(session)}
${waste(session)}
${carriers(session)}
${skills(session)}`;
}

function value(input: number | null): string {
  return input === null ? '—' : numbers.format(input);
}

function carriers(session: SessionSummary): string {
  if (session.carriers.length === 0) return block('Top carriers', '<p class="sub">none measurable</p>');
  const max = session.carriers[0]?.rent ?? 1;
  const rows = session.carriers
    .slice(0, 10)
    .map(
      (carrier) => `<div class="row">
      <span class="name">${escape(carrier.carrier)}</span>
      <span class="bar"><i style="width:${Math.max(2, Math.round((100 * carrier.rent) / max))}%"></i></span>
      <span class="val">${numbers.format(carrier.rent)} rent · t${carrier.firstTurn}–${carrier.lastTurn}</span>
    </div>`,
    )
    .join('\n');
  return block('Top carriers', rows);
}

function waste(session: SessionSummary): string {
  if (session.wasteRent === null) {
    return block('Waste', '<p class="sub">unavailable: the record does not say enough to classify</p>');
  }
  if (session.waste.length === 0) return block('Waste', '<p class="sub">none found</p>');

  const max = session.waste[0]?.rent ?? 1;
  const rows = WASTE_ORDER.flatMap((kind) =>
    session.waste
      .filter((claim) => claim.kind === kind)
      .slice(0, 2)
      .map(
        (claim) => `<div class="row waste">
      <span class="name">${escape(short(claim.carrier))}</span>
      <span class="bar"><i style="width:${Math.max(2, Math.round((100 * claim.rent) / max))}%"></i></span>
      <span class="val">${numbers.format(claim.rent)} waste</span>
    </div>
    <p class="sub">${escape(claim.kind)} — ${escape(claim.reason)}</p>`,
      ),
  );
  return block('Waste', rows.join('\n'));
}

function whatToChange(session: SessionSummary): string {
  const advice = prescribe({ claims: session.waste, carriers: session.carriers, rent: session.rent });
  if (advice.length === 0) return '';

  const rows = advice
    .map(
      (item, index) => `<div class="row">
      <span class="name">${index + 1}. ${escape(item.advice)}</span>
      <span class="bar"><i style="width:${Math.max(2, Math.round((100 * item.saving) / (advice[0]?.saving ?? 1)))}%"></i></span>
      <span class="val">${numbers.format(item.saving)} token-turns</span>
    </div>`,
    )
    .join('\n');

  return block('What to change', rows);
}

function skills(session: SessionSummary): string {
  if (session.skills === null) {
    return block(
      'Skills and MCP tools',
      '<p class="sub">unavailable: the record has no attribution fields</p>',
    );
  }
  if (session.skills.length === 0) return '';
  const max = session.skills[0]?.rent ?? 1;
  const rows = session.skills
    .map(
      (skill) => `<div class="row">
      <span class="name">${escape(skill.name)} (${escape(skill.kind)})</span>
      <span class="bar"><i style="width:${Math.max(2, Math.round((100 * skill.rent) / max))}%"></i></span>
      <span class="val">${numbers.format(skill.rent)} rent</span>
    </div>`,
    )
    .join('\n');
  return block('Skills and MCP tools', rows);
}

function aggregate(model: AuditModel): string {
  const ranked = [...model.sessions].sort((a, b) => (b.rent ?? -1) - (a.rent ?? -1));
  const shown = ranked.slice(0, AGGREGATE_LIMIT);

  const rows = shown
    .map(
      (session) => `<tr>
      <td>${escape(session.sessionId)}</td>
      <td class="num">${session.turns.length}</td>
      <td class="num">${session.tokens === null ? '—' : numbers.format(session.tokens.total)}</td>
      <td class="num">${value(session.rent)}</td>
      <td class="num">${session.rentScore ?? '—'}</td>
      <td class="num">${value(session.wasteRent)}</td>
    </tr>`,
    )
    .join('\n');

  const more =
    ranked.length > shown.length
      ? `<p class="sub">showing the ${AGGREGATE_LIMIT} highest-rent sessions of ${numbers.format(ranked.length)}</p>`
      : '';

  return `<section class="hero">
  <div><b>${value(model.totals.rent)}</b><span>token-turns of rent</span></div>
  <div><b>${model.totals.rentScore ?? '–'}</b><span>score out of 100</span></div>
  <div><b>${value(model.totals.wasteRent)}</b><span>token-turns of waste</span></div>
  <div><b>${model.sessions.length}</b><span>sessions profiled</span></div>
</section>
${block(
  'Sessions',
  `<table>
  <thead><tr><th>session</th><th>turns</th><th>tokens</th><th>rent</th><th>score</th><th>waste</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
${more}
<p class="sub">coverage: ${model.totals.measuredSessions} sessions with usage, ${model.totals.unmeasuredSessions} without, ${model.totals.sessionsWithRent} with rent, ${numbers.format(model.totals.unknownInjections)} unmeasurable injections</p>`,
)}`;
}

function short(text: string, limit = 72): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function block(title: string, body: string): string {
  return `<h2>${escape(title)}</h2>
${body}`;
}

function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
