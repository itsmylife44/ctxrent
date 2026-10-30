import type { DiffResult } from '../diff.ts';
import type { TaskSet } from '../taskset.ts';

const numbers = new Intl.NumberFormat('en-US');

export function renderDiff(taskSet: TaskSet, result: DiffResult): string {
  const lines: string[] = [];

  lines.push(
    `task set: ${taskSet.tasks.length} tasks x ${taskSet.repeat} runs · runner ${taskSet.runner}`,
  );
  lines.push('');
  lines.push(variantLine(result.a));
  lines.push(variantLine(result.b));
  lines.push(
    `delta  rent ${signed(result.rentDelta)} (${percent(result.rentDelta, result.a.rent)}) · success ${signed(result.successDelta)}`,
  );
  lines.push('');
  lines.push('per task');

  const width = Math.max(...result.tasks.map((task) => task.taskId.length), 8);

  for (const task of result.tasks) {
    const note =
      task.a === 0 && task.b === 0
        ? 'fails in both'
        : task.b < task.a
          ? 'regressed'
          : task.b > task.a
            ? 'improved'
            : '';
    lines.push(
      `  ${task.taskId.padEnd(width)}  a ${task.a}/${task.runs}   b ${task.b}/${task.runs}${note === '' ? '' : `   ${note}`}`,
    );
  }

  return `${lines.join('\n')}\n`;
}

function variantLine(variant: { name: string; passed: number; runs: number; rent: number }): string {
  return `${variant.name}  ${variant.passed}/${variant.runs} passed · ${numbers.format(variant.rent)} rent`;
}

function signed(value: number): string {
  if (value === 0) return '0';
  return `${value > 0 ? '+' : '−'}${numbers.format(Math.abs(value))}`;
}

function percent(delta: number, base: number): string {
  if (base === 0) return 'n/a';
  const share = Math.round((100 * delta) / base);
  if (share === 0) return '0%';
  return `${share > 0 ? '+' : '−'}${Math.abs(share)}%`;
}
