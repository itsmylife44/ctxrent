import type { Teaching } from '../teach.ts';

const numbers = new Intl.NumberFormat('en-US');

export type TeachPlan = {
  path: string;
  state: 'a new file' | 'replaces its managed block' | 'appends a block';
  content: string;
};

export type TeachOutcome = 'preview' | 'declined' | 'applied';

export type TeachReport = {
  teachings: Teaching[];
  sessionCount: number;
  turns: number;
  block: string;
  plan: TeachPlan | null;
  outcome: TeachOutcome;
};

export function renderTeach(report: TeachReport): string {
  const lines: string[] = [];
  const instructions = report.teachings.filter((item) => item.lever === 'instruction');
  const configured = report.teachings.filter((item) => item.lever === 'configuration');

  lines.push(
    `${numbers.format(report.sessionCount)} sessions · ${numbers.format(report.turns)} turns analysed · ${report.teachings.length} rules with evidence`,
  );

  if (report.teachings.length === 0) {
    lines.push('');
    lines.push('no rule recurs in enough sessions to be worth writing down');
    return `${lines.join('\n')}\n`;
  }

  lines.push('');
  lines.push('rules');
  const width = Math.max(...report.teachings.map((item) => item.id.length), 8);
  for (const item of report.teachings) {
    lines.push(
      `  ${item.id.padEnd(width)}  ${item.lever.padEnd(14)}${numbers.format(item.claims).padStart(6)} claims · ${String(item.sessions).padStart(5)} sessions · ${numbers.format(item.saving).padStart(13)} token-turns`,
    );
  }

  if (configured.length > 0) {
    lines.push('');
    lines.push('configuration findings — these are not instructions:');
    for (const item of configured) {
      lines.push(`  ${item.id}`);
      lines.push(`    ${item.advice}`);
      lines.push(`    evidence: ${numbers.format(item.claims)} claims in ${item.sessions} sessions`);
    }
    lines.push('  told to the agent in an instruction file, none of these can take effect.');
  }

  lines.push('');

  if (report.plan === null) {
    lines.push('dry run — nothing will be written. Copy the block below into an instruction file,');
    lines.push('or re-run with --write <file> to preview an application.');
    lines.push('');
    lines.push(report.block);
    return `${lines.join('\n')}\n`;
  }

  lines.push(`target   ${report.plan.path}`);
  lines.push(`file     ${report.plan.state}`);
  lines.push(`contents ${instructions.length} rule(s), inside the ctxrent managed block`);
  lines.push('');
  lines.push(report.block);
  lines.push('');
  lines.push('This edits an instruction file your agent reads in every session of every project.');
  lines.push('After applying it, verify the effect with: ctxrent check --max-waste 30');
  lines.push(`To undo, delete everything between the two markers in ${report.plan.path}.`);

  if (report.outcome === 'declined') {
    lines.push('');
    lines.push('nothing written.');
  }
  if (report.outcome === 'applied') {
    lines.push('');
    lines.push(`wrote the managed block to ${report.plan.path}`);
  }

  return `${lines.join('\n')}\n`;
}
