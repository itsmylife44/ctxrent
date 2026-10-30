export type Runner = 'claude' | 'codex';

export type Task = {
  id: string;
  prompt: string;
  verify: string;
};

export type TaskSet = {
  runner: Runner;
  repeat: number;
  tasks: Task[];
};

export type TaskSetResult =
  | { ok: true; taskSet: TaskSet }
  | { ok: false; error: string };

const RUNNERS: Runner[] = ['claude', 'codex'];
const MAX_REPEAT = 100;

export function parseTaskSet(text: string): TaskSetResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'task set is not valid JSON' };
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'task set must be an object' };
  }

  const document = raw as Record<string, unknown>;

  const runner = document['runner'];
  if (typeof runner !== 'string' || !RUNNERS.includes(runner as Runner)) {
    return { ok: false, error: `runner must be one of ${RUNNERS.join(', ')}` };
  }

  const repeat = document['repeat'];
  if (typeof repeat !== 'number' || !Number.isInteger(repeat) || repeat < 1 || repeat > MAX_REPEAT) {
    return { ok: false, error: `repeat must be an integer between 1 and ${MAX_REPEAT}` };
  }

  const rawTasks = document['tasks'];
  if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
    return { ok: false, error: 'tasks must be a non-empty array' };
  }

  const tasks: Task[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of rawTasks.entries()) {
    if (entry === null || typeof entry !== 'object') {
      return { ok: false, error: `tasks[${index}] must be an object` };
    }
    const task = entry as Record<string, unknown>;

    const id = task['id'];
    if (typeof id !== 'string' || id.trim() === '') {
      return { ok: false, error: `tasks[${index}].id must be a non-empty string` };
    }
    if (seen.has(id)) return { ok: false, error: `tasks[${index}].id "${id}" is duplicated` };
    seen.add(id);

    const prompt = task['prompt'];
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return { ok: false, error: `tasks[${index}].prompt must be a non-empty string` };
    }

    const verify = task['verify'];
    if (typeof verify !== 'string' || verify.trim() === '') {
      return { ok: false, error: `tasks[${index}].verify must be a non-empty string` };
    }

    tasks.push({ id, prompt, verify });
  }

  return { ok: true, taskSet: { runner: runner as Runner, repeat, tasks } };
}

export function templateTaskSet(): string {
  const template: TaskSet = {
    runner: 'claude',
    repeat: 3,
    tasks: [
      {
        id: 'example',
        prompt: 'Describe the task you want the agent to perform.',
        verify: 'exit 0',
      },
    ],
  };
  return `${JSON.stringify(template, null, 2)}\n`;
}
