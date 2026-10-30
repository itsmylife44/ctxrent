import type { Teaching } from '../teach.ts';

const numbers = new Intl.NumberFormat('en-US');

export type TeachReport = {
  teachings: Teaching[];
  sessionCount: number;
  turns: number;
  block: string;
  writePath: string | null;
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
    lines.push('not instructions — these are configuration, and writing them in AGENTS.md does nothing:');
    for (const item of configured) {
      lines.push(`  ${item.id}`);
      lines.push(`    ${item.advice}`);
      lines.push(`    evidence: ${numbers.format(item.claims)} claims in ${item.sessions} sessions`);
    }
  }

  lines.push('');
  if (report.writePath === null) {
    lines.push('dry run — paste this block into your agent instruction file, or pass --write <file>:');
    lines.push('');
    lines.push(report.block);
  } else {
    lines.push(`wrote the managed block to ${report.writePath}`);
    if (instructions.length === 0) lines.push('the block contains no instruction rules');
  }

  return `${lines.join('\n')}\n`;
}
