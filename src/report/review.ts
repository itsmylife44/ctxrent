import type { AuditModel } from '../model.ts';
import type { ManagedRule, Teaching } from '../teach.ts';
import { escapeHtml as escape, page as document, short } from './theme.ts';

const numbers = new Intl.NumberFormat('en-US');

export type ReviewPage = {
  token: string;
  model: AuditModel;
  target: string;
  existingRules: ManagedRule[];
  /** Rules this run's agent wrote from the evidence, not written by the tool. */
  rules: ManagedRule[];
  configuration: Teaching[];
};

export function renderReview(input: ReviewPage): string {
  const { model, target, token, existingRules, rules, configuration } = input;
  // A finding the file lacks is new. A finding it already has, worded differently, is a rewrite:
  // offered unticked, so the current wording stays unless the user picks the new one.
  const current = new Map(existingRules.map((rule) => [rule.id ?? rule.advice, rule.advice]));
  const fresh = rules.filter((rule) => !current.has(rule.id ?? rule.advice));
  const rewrites = rules.flatMap((rule) => {
    const old = current.get(rule.id ?? rule.advice);
    return old === undefined || old === rule.advice ? [] : [{ ...rule, replaces: old }];
  });

  const top = model.sessions
    .flatMap((session) => session.carriers)
    .sort((a, b) => b.rent - a.rent)[0];
  const rent = model.totals.rent ?? 0;

  const body = `<h1>ctxrent</h1>

<section class="hero">
  <div>
    <p class="hero-number">${numbers.format(rent)}</p>
    <p class="hero-label">token-turns of rent across ${numbers.format(model.sessions.length)} sessions</p>
  </div>
  <div class="hero-side">
    <p class="score">${model.totals.rentScore ?? '–'}<span class="hero-label"> score out of 100</span></p>
    <button type="submit" form="rules">Apply the selected rules</button>
  </div>
</section>

<p>${problemSentence(top, rent, model.totals.wasteRent)}</p>

<form id="rules" method="post" action="/${escape(token)}/apply">
<h2>Already in this file</h2>
${
  existingRules.length === 0
    ? '<p class="note">Nothing yet: the managed block is empty.</p>'
    : `<p class="note">Untick a rule to remove it. Nothing is dropped unless you say so.</p>
<div class="rules">
${existingRules
  .map(
    ({ advice }) => `<label class="rule">
  <input type="checkbox" name="keep" value="${escape(advice)}" checked>
  <span><span class="rule-title">${escape(advice)}</span></span>
  <span></span>
</label>`,
  )
  .join('\n')}
</div>`
}

<h2>Written from this run</h2>
${
  fresh.length === 0
    ? '<p class="note">Nothing new: this run adds no rule that is not already in the file.</p>'
    : `<p class="note">Written by your agent from the evidence. Untick anything you do not want.</p>
<div class="rules">
${fresh
  .map(
    (item) => `<label class="rule">
  <input type="checkbox" name="rule" value="${escape(item.id ?? '')}" checked>
  <span><span class="rule-title">${escape(item.advice)}</span></span>
  <span></span>
</label>`,
  )
  .join('\n')}
</div>`
}

${
  rewrites.length === 0
    ? ''
    : `<h2>Rewrites of rules already here</h2>
<p class="note">Your agent wrote a new version of a rule this file has. Tick it to replace the current wording.</p>
<div class="rules">
${rewrites
  .map(
    (item) => `<label class="rule">
  <input type="checkbox" name="rule" value="${escape(item.id ?? '')}">
  <span>
    <span class="rule-title">${escape(item.advice)}</span>
    <span class="rule-meta">replaces: ${escape(item.replaces)}</span>
  </span>
  <span></span>
</label>`,
  )
  .join('\n')}
</div>`
}

<div class="target">
<label for="target">Instruction file your agent reads in every project</label>
<input type="text" id="target" name="target" value="${escape(target)}" readonly>
</div>
</form>

${
  configuration.length === 0
    ? ''
    : `<h2>Not fixable by an instruction</h2>
<p class="note">These are configuration. Writing them into an instruction file would do nothing.</p>
<div class="rules">
${configuration
  .map(
    (item) => `<div class="rule">
  <span></span>
  <span>
    <span class="rule-title">${escape(item.label)}</span>
    <span class="rule-meta">${numbers.format(item.claims)} claims in ${item.sessions} sessions, ${numbers.format(item.saving)} token-turns</span>
  </span>
  <span class="saving">${numbers.format(item.saving)}</span>
</div>`,
  )
  .join('\n')}
</div>`
}

<h2>Where the rent goes</h2>
<div class="bars">
${topCarriers(model, rent)}
</div>

<footer>
<p>Applying writes a managed block into the target file. To undo, delete everything between the two markers in that file.</p>
<p>Verify the effect afterwards with <code>ctxrent check --max-waste 30</code>.</p>
</footer>`;

  return document({
    title: 'ctxrent review',
    description:
      'Rules written by your agent from measured evidence: tick what you keep, then apply.',
    body,
  });
}

function topCarriers(model: AuditModel, rent: number): string {
  const carriers = model.sessions
    .flatMap((session) => session.carriers)
    .sort((a, b) => b.rent - a.rent)
    .slice(0, 5);

  if (carriers.length === 0) return '<p class="note">Nothing measurable.</p>';
  const max = carriers[0]?.rent ?? 1;

  return carriers
    .map(
      (carrier) => `<div class="bar">
  <span class="bar-name">${escape(short(carrier.carrier, 64))}</span>
  <span class="bar-track"><span class="bar-fill${carrier.kind === 'attachment' ? ' waste' : ''}" style="width:${Math.max(2, Math.round((100 * carrier.rent) / max))}%"></span></span>
  <span class="bar-value">${rent === 0 ? '–' : `${Math.round((100 * carrier.rent) / rent)}%`}</span>
</div>`,
    )
    .join('\n');
}

function problemSentence(
  top: { carrier: string; rent: number } | undefined,
  rent: number,
  waste: number | null,
): string {
  if (top === undefined || rent === 0) return 'No measurable rent to report.';
  const share = Math.round((100 * top.rent) / rent);
  const wasteText =
    waste === null
      ? 'Waste could not be measured.'
      : `Waste is ${numbers.format(waste)} token-turns.`;
  return `The largest cost is ${escape(short(top.carrier, 60))}, at ${share}% of the rent. ${wasteText}`;
}

export function renderApplied(input: { rules: string[]; target: string; block: string }): string {
  const count = input.rules.length;
  const body = `<h1>ctxrent</h1>

<h2>${count === 0 ? 'Nothing selected' : `${count} rule${count === 1 ? '' : 's'} written`}</h2>
<p>${count === 0 ? 'No rules were selected, so the file was left unchanged.' : `The managed block was written to ${escape(input.target)}.`}</p>
${count === 0 ? '' : `<pre>${escape(input.block)}</pre>`}

<footer>
<p>Close this tab. Verify the effect with <code>ctxrent check --max-waste 30</code>.</p>
</footer>`;

  return document({
    title: 'ctxrent applied',
    description: 'The selected rules were written to the instruction file.',
    body,
  });
}
