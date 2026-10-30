import type { SessionSummary } from './model.ts';
import type { Deps } from './deps.ts';
import { parseSession } from './adapters/index.ts';
import type { Runner, Task } from './taskset.ts';

export const RUNNER_UNAVAILABLE = 127;

export type TaskOutcome = {
  taskId: string;
  success: boolean;
  rent: number | null;
  code: number;
  session: SessionSummary | null;
};

function quote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function runnerCommand(runner: Runner, prompt: string): string {
  return runner === 'claude'
    ? `claude -p --output-format stream-json --verbose ${quote(prompt)}`
    : `codex exec --json ${quote(prompt)}`;
}

export async function runTask(
  deps: Deps,
  runner: Runner,
  task: Task,
  cwd: string,
): Promise<TaskOutcome> {
  const agent = await deps.exec(runnerCommand(runner, task.prompt), cwd);
  if (agent.code === RUNNER_UNAVAILABLE) {
    return { taskId: task.id, success: false, rent: null, code: RUNNER_UNAVAILABLE, session: null };
  }

  const session = parseSession(agent.stdout, task.id).session;
  const verification = await deps.exec(task.verify, cwd);

  return {
    taskId: task.id,
    success: verification.code === 0,
    rent: session.rent,
    code: agent.code,
    session,
  };
}
