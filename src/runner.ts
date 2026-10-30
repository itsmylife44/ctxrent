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

/** The agent is invoked as a program with arguments, never through a shell string. */
export function runnerInvocation(
  runner: Runner,
  prompt: string,
): { file: string; args: string[] } {
  return runner === 'claude'
    ? { file: 'claude', args: ['-p', '--output-format', 'stream-json', '--verbose', prompt] }
    : { file: 'codex', args: ['exec', '--json', prompt] };
}

export async function runTask(
  deps: Deps,
  runner: Runner,
  task: Task,
  cwd: string,
): Promise<TaskOutcome> {
  const invocation = runnerInvocation(runner, task.prompt);
  const agent = await deps.execFile(invocation.file, invocation.args, cwd);
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
