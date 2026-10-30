import type { AuditModel, SessionSummary, WasteKind } from '../model.ts';
import { prescribe } from '../prescriptions.ts';
import { escapeHtml, page, short } from './theme.ts';

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
  const title = single === undefined ? `${model.sessions.length} sessions` : single.sessionId;

  return page({
    title: `ctxrent report: ${escapeHtml(title)}`,
    description:
      'Context rent: what a coding agent keeps paying for the content it holds in context, and what to change.',
    body: single === undefined ? aggregateBody(model) : sessionBody(single),
  });
}

function sessionBody(session: SessionSummary): string {
  const advice = prescribe({
    claims: session.waste,
    carriers: session.carriers,
    rent: session.rent,
  });
  const top = session.carriers[0];

  return `<h1>ctxrent</h1>

<section class="hero">
  <div>
    <p class="hero-number">${value(session.rent)}</p>
    <p class="hero-label">token-turns of rent over ${session.turns.length} turns</p>
  </div>
  <div class="hero-side">
    <p class="score">${session.rentScore ?? '–'}<span class="hero-label"> score out of 100</span></p>
    <p class="hero-label">${value(session.wasteRent)} token-turns of waste</p>
  </div>
</section>

<p>${problemSentence(top, session.rent, session.wasteRent)}</p>

${advice.length === 0 ? '' : section('What to change', adviceList(advice))}

${section('Where the rent goes', bars(session.carriers, session.rent))}

${section('Waste', wasteList(session))}

${skillsSection(session)}

<footer>
<p>Context rent is measured in token-turns: one token held in context for one request. Token-turns are a volume, not a sum of money.</p>
<p>${coverageLine(session)}</p>
</footer>`;
}

function aggregateBody(model: AuditModel): string {
  const ranked = [...model.sessions].sort((a, b) => (b.rent ?? -1) - (a.rent ?? -1));
  const shown = ranked.slice(0, AGGREGATE_LIMIT);

  const rows = shown
    .map(
      (session) => `<tr>
  <td>${escapeHtml(short(session.sessionId, 44))}</td>
  <td class="num">${session.turns.length}</td>
  <td class="num">${session.tokens === null ? '–' : numbers.format(session.tokens.total)}</td>
  <td class="num">${value(session.rent)}</td>
  <td class="num">${session.rentScore ?? '–'}</td>
  <td class="num">${value(session.wasteRent)}</td>
</tr>`,
    )
    .join('\n');

  const more =
    ranked.length > shown.length
      ? `<p class="note">Showing the ${shown.length} highest-rent sessions of ${numbers.format(ranked.length)}.</p>`
      : '';

  return `<h1>ctxrent</h1>

<section class="hero">
  <div>
    <p class="hero-number">${value(model.totals.rent)}</p>
    <p class="hero-label">token-turns of rent over ${numbers.format(model.totals.turns)} turns</p>
  </div>
  <div class="hero-side">
    <p class="score">${model.totals.rentScore ?? '–'}<span class="hero-label"> score out of 100</span></p>
    <p class="hero-label">${value(model.totals.wasteRent)} token-turns of waste</p>
    <p class="hero-label">${numbers.format(model.sessions.length)} sessions profiled</p>
  </div>
</section>

${section(
  'Sessions',
  `<table>
  <thead><tr><th>Session</th><th>Turns</th><th>Tokens</th><th>Rent</th><th>Score</th><th>Waste</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
${more}`,
)}

<footer>
<p>Context rent is measured in token-turns: one token held in context for one request. Token-turns are a volume, not a sum of money.</p>
<p>Coverage: ${model.totals.measuredSessions} sessions with usage, ${model.totals.unmeasuredSessions} without, ${model.totals.sessionsWithRent} with rent, ${numbers.format(model.totals.unknownInjections)} unmeasurable injections.</p>
</footer>`;
}

function section(title: string, body: string): string {
  return `<h2>${escapeHtml(title)}</h2>
${body}`;
}

function adviceList(advice: ReturnType<typeof prescribe>): string {
  const rows = advice
    .map(
      (item, index) => `<div class="rule">
  <span class="saving">${index + 1}</span>
  <span>
    <span class="rule-title">${escapeHtml(item.advice)}</span>
    <span class="rule-meta">${numbers.format(item.claims)} claims, ${numbers.format(item.saving)} token-turns${item.basis === 'always-on' ? ', always-on context not counted as waste' : ''}</span>
    <span class="rule-eg">e.g. ${escapeHtml(short(item.example, 90))}</span>
  </span>
  <span class="saving">${numbers.format(item.saving)}</span>
</div>`,
    )
    .join('\n');
  return `<div class="rules">${rows}</div>`;
}

function bars(carriers: SessionSummary['carriers'], rent: number | null): string {
  if (carriers.length === 0) return '<p class="note">Nothing measurable.</p>';
  const max = carriers[0]?.rent ?? 1;

  return `<div class="bars">
${carriers
  .slice(0, 8)
  .map(
    (carrier) => `<div class="bar">
  <span class="bar-name">${escapeHtml(short(carrier.carrier, 64))}</span>
  <span class="bar-track"><span class="bar-fill${carrier.kind === 'attachment' ? ' waste' : ''}" style="width:${Math.max(2, Math.round((100 * carrier.rent) / max))}%"></span></span>
  <span class="bar-value">${rent === null || rent === 0 ? '–' : `${Math.round((100 * carrier.rent) / rent)}%`}</span>
</div>`,
  )
  .join('\n')}
</div>`;
}

function wasteList(session: SessionSummary): string {
  if (session.wasteRent === null) {
    return '<p class="note">Unavailable: the record does not say enough to classify.</p>';
  }
  if (session.waste.length === 0) return '<p class="note">None found.</p>';

  const rows = WASTE_ORDER.flatMap((kind) =>
    session.waste
      .filter((claim) => claim.kind === kind)
      .slice(0, 3)
      .map(
        (claim) => `<div class="rule">
  <span class="saving">${numbers.format(claim.rent)}</span>
  <span>
    <span class="rule-title">${escapeHtml(claim.kind)}</span>
    <span class="rule-meta">${escapeHtml(short(claim.carrier, 80))}</span>
    <span class="rule-eg">${escapeHtml(claim.reason)}</span>
  </span>
  <span></span>
</div>`,
      ),
  );

  return `<div class="rules">${rows.join('\n')}</div>`;
}

function skillsSection(session: SessionSummary): string {
  if (session.skills === null) {
    return section(
      'Skills and MCP tools',
      '<p class="note">Unavailable: the record has no attribution fields.</p>',
    );
  }
  if (session.skills.length === 0) return '';

  const rows = session.skills
    .slice(0, 6)
    .map(
      (skill) => `<div class="rule">
  <span class="saving"></span>
  <span>
    <span class="rule-title">${escapeHtml(skill.name)}</span>
    <span class="rule-meta">${escapeHtml(skill.kind)}</span>
  </span>
  <span class="saving">${numbers.format(skill.rent)}</span>
</div>`,
    )
    .join('\n');

  return section('Skills and MCP tools', `<div class="rules">${rows}</div>`);
}

function problemSentence(
  top: { carrier: string; rent: number } | undefined,
  rent: number | null,
  waste: number | null,
): string {
  if (top === undefined || rent === null || rent === 0) return 'No measurable rent to report.';
  const share = Math.round((100 * top.rent) / rent);
  const wasteText =
    waste === null
      ? 'Waste could not be measured.'
      : `Waste is ${numbers.format(waste)} token-turns.`;
  return `The largest cost is ${escapeHtml(short(top.carrier, 60))}, at ${share}% of the rent. ${wasteText}`;
}

function coverageLine(session: SessionSummary): string {
  const parts = [
    `${session.turns.length} turns`,
    session.tokens === null
      ? 'tokens unavailable'
      : `${numbers.format(session.tokens.total)} tokens spent`,
  ];
  if (session.coverage !== null) {
    parts.push(`${Math.round(100 * session.coverage)}% of context accounted for`);
  }
  if (session.unknownInjections > 0) parts.push(`${session.unknownInjections} unmeasurable`);
  return `${parts.join('. ')}.`;
}

function value(input: number | null): string {
  return input === null ? '–' : numbers.format(input);
}
