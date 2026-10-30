import type { Deps } from './deps.ts';
import type { TaskSet } from './taskset.ts';
import { RUNNER_UNAVAILABLE, runTask } from './runner.ts';

export type Variant = { name: string; dir: string };

export type VariantSummary = {
  name: string;
  passed: number;
  runs: number;
  rent: number;
};

export type TaskSummary = {
  taskId: string;
  a: number;
  b: number;
  runs: number;
};

export type DiffResult = {
  a: VariantSummary;
  b: VariantSummary;
  tasks: TaskSummary[];
  rentDelta: number;
  successDelta: number;
};

export type DiffOutcome = { ok: true; result: DiffResult } | { ok: false; error: string };

export async function diffTaskSet(
  deps: Deps,
  taskSet: TaskSet,
  variants: [Variant, Variant],
): Promise<DiffOutcome> {
  const [first] = variants;
  const available = await deps.exec(`command -v ${taskSet.runner}`, first.dir);
  if (available.code !== 0) {
    return { ok: false, error: `runner "${taskSet.runner}" is not available` };
  }

  const summaries: VariantSummary[] = [];
  const perTask = new Map<string, TaskSummary>();
  for (const task of taskSet.tasks) {
    perTask.set(task.id, { taskId: task.id, a: 0, b: 0, runs: taskSet.repeat });
  }

  for (const [index, variant] of variants.entries()) {
    let passed = 0;
    let runs = 0;
    let rent = 0;

    for (const task of taskSet.tasks) {
      for (let repetition = 0; repetition < taskSet.repeat; repetition += 1) {
        const workingCopy = await deps.makeTempDir('ctxrent-run-');
        try {
          await deps.copyDir(variant.dir, workingCopy);
          const outcome = await runTask(deps, taskSet.runner, task, workingCopy);

          if (outcome.code === RUNNER_UNAVAILABLE) {
            return { ok: false, error: `runner "${taskSet.runner}" is not available` };
          }

          runs += 1;
          if (outcome.success) passed += 1;
          rent += outcome.rent ?? 0;

          const taskSummary = perTask.get(task.id);
          if (taskSummary !== undefined && outcome.success) {
            if (index === 0) taskSummary.a += 1;
            else taskSummary.b += 1;
          }
        } finally {
          await deps.removeDir(workingCopy);
        }
      }
    }

    summaries.push({ name: variant.name, passed, runs, rent });
  }

  const a = summaries[0] as VariantSummary;
  const b = summaries[1] as VariantSummary;

  return {
    ok: true,
    result: {
      a,
      b,
      tasks: [...perTask.values()],
      rentDelta: b.rent - a.rent,
      successDelta: b.passed - a.passed,
    },
  };
}
