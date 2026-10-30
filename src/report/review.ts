import type { AuditModel } from '../model.ts';
import type { Teaching } from '../teach.ts';
import { escapeHtml as escape, page as document, short } from './theme.ts';

const numbers = new Intl.NumberFormat('en-US');

export type ReviewPage = {
  token: string;
  model: AuditModel;
  teachings: Teaching[];
  target: string;
  existingRules: string[];
};

export function renderReview(input: ReviewPage): string {
  const { model, teachings, target, token, existingRules } = input;
  const alreadyThere = new Set(existingRules);
  const instructions = teachings.filter(
    (item) => item.lever === 'instruction' && !alreadyThere.has(item.advice),
  );
  const configured = teachings.filter((item) => item.lever === 'configuration');
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
    (advice) => `<label class="rule">
  <input type="checkbox" name="keep" value="${escape(advice)}" checked>
  <span><span class="rule-title">${escape(advice)}</span></span>
  <span></span>
</label>`,
  )
  .join('\n')}
</div>`
}

<h2>New rules from this run</h2>
${
  instructions.length === 0
    ? '<p class="note">Nothing new: today\'s sessions add no rule that is not already in the file.</p>'
    : `<p class="note">Each rule recurs across your sessions. Untick anything you do not want.</p>
<div class="rules">
${instructions.map((item) => rule(item)).join('\n')}
</div>`
}

<div class="target">
<label for="target">Instruction file your agent reads in every project</label>
<input type="text" id="target" name="target" value="${escape(target)}" required>
</div>
</form>

${
  configured.length === 0
    ? ''
    : `<h2>Not fixable by an instruction</h2>
<p class="note">These are configuration. Writing them into an instruction file would do nothing.</p>
<div class="rules">
${configured
  .map(
    (item) => `<div class="rule">
  <span></span>
  <span>
    <span class="rule-title">${escape(item.advice)}</span>
    <span class="rule-meta">${numbers.format(item.claims)} claims in ${item.sessions} sessions</span>
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
      'Choose which context-hygiene rules to write into your agent instruction file, with the evidence behind each one.',
    body,
  });
}

function rule(item: Teaching): string {
  return `<label class="rule">
  <input type="checkbox" name="rule" value="${escape(item.id)}" checked>
  <span>
    <span class="rule-title">${escape(item.advice)}</span>
    <span class="rule-meta">${numbers.format(item.claims)} claims in ${item.sessions} sessions, ${numbers.format(item.saving)} token-turns</span>
    <span class="rule-eg">e.g. ${escape(short(item.example, 90))}</span>
  </span>
  <span class="saving">${numbers.format(item.saving)}</span>
</label>`;
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
