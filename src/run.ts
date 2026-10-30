import { basename, join } from 'node:path';
import type { SessionSummary } from './model.ts';
import { summariseSessions } from './model.ts';
import { parseSession } from './adapters/index.ts';
import type { Deps } from './deps.ts';
import { renderText } from './report/text.ts';
import { renderHtml } from './report/html.ts';
import { renderDiff } from './report/diff.ts';
import { parseTaskSet, templateTaskSet } from './taskset.ts';
import { diffTaskSet } from './diff.ts';

export type Result = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const MAX_DEPTH = 8;
const DEFAULT_TASK_SET = 'ctxrent.json';

type AuditOptions = {
  target: string | undefined;
  json: boolean;
  all: boolean;
  html: string | null;
};

type DiffOptions = {
  taskSet: string | undefined;
  a: string | undefined;
  b: string | undefined;
};

export async function run(argv: string[], deps: Deps): Promise<Result> {
  try {
    return await dispatch(argv, deps);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failure(`ctxrent: ${message}`);
  }
}

async function dispatch(argv: string[], deps: Deps): Promise<Result> {
  const [command, ...rest] = argv;

  if (command === 'audit') return runAudit(rest, deps);
  if (command === 'init') return runInit(rest, deps);
  if (command === 'diff') return runDiff(rest, deps);

  return failure(`ctxrent: unknown command ${command === undefined ? '(none)' : `"${command}"`}`);
}

async function runAudit(args: string[], deps: Deps): Promise<Result> {
  const parsed = parseAuditArgs(args);
  if (!parsed.ok) return failure(parsed.error);

  const { target, json, all, html } = parsed.options;
  if (target === undefined) return failure('ctxrent: audit needs a session path');

  const sessionFiles = all
    ? await walkSessions(target, deps)
    : await collectSessionFiles(target, deps);

  if (sessionFiles.length === 0) {
    return failure(`ctxrent: no sessions found under ${target}`);
  }

  const sessions: SessionSummary[] = [];
  let records = 0;

  for (const file of sessionFiles) {
    let text: string;
    try {
      text = await deps.readText(file);
    } catch {
      continue;
    }
    const parsedSession = parseSession(text, basename(file, '.jsonl'));
    records += parsedSession.records;
    sessions.push(parsedSession.session);
  }

  if (records === 0) {
    return failure(`ctxrent: no readable sessions under ${target}`);
  }

  const model = summariseSessions(sessions);

  if (json) return { exitCode: 0, stdout: `${JSON.stringify(model, null, 2)}\n`, stderr: '' };

  if (html !== null) {
    await deps.writeArtifact(html, renderHtml(model));
    return { exitCode: 0, stdout: `wrote ${html}\n`, stderr: '' };
  }

  return { exitCode: 0, stdout: renderText(model), stderr: '' };
}

async function runInit(args: string[], deps: Deps): Promise<Result> {
  const target = args[0] ?? DEFAULT_TASK_SET;

  if (args.length > 1) return failure(`ctxrent: unexpected argument "${args[1]}"`);
  if (target.startsWith('-')) return failure(`ctxrent: unknown option "${target}"`);

  if ((await deps.kind(target)) !== 'missing') {
    return failure(`ctxrent: ${target} already exists`);
  }

  await deps.writeArtifact(target, templateTaskSet());
  return { exitCode: 0, stdout: `wrote ${target}\n`, stderr: '' };
}

async function runDiff(args: string[], deps: Deps): Promise<Result> {
  const parsed = parseDiffArgs(args);
  if (!parsed.ok) return failure(parsed.error);

  const { taskSet: path, a, b } = parsed.options;
  if (path === undefined) return failure('ctxrent: diff needs a task set');
  if (a === undefined || b === undefined) {
    return failure('ctxrent: diff needs --a <dir> and --b <dir>');
  }

  let text: string;
  try {
    text = await deps.readText(path);
  } catch {
    return failure(`ctxrent: cannot read ${path}`);
  }

  const parsedTaskSet = parseTaskSet(text);
  if (!parsedTaskSet.ok) return failure(`ctxrent: ${parsedTaskSet.error}`);

  const outcome = await diffTaskSet(deps, parsedTaskSet.taskSet, [
    { name: 'a', dir: a },
    { name: 'b', dir: b },
  ]);

  if (!outcome.ok) return failure(`ctxrent: ${outcome.error}`);

  return { exitCode: 0, stdout: renderDiff(parsedTaskSet.taskSet, outcome.result), stderr: '' };
}

function parseDiffArgs(
  args: string[],
): { ok: true; options: DiffOptions } | { ok: false; error: string } {
  const options: DiffOptions = { taskSet: undefined, a: undefined, b: undefined };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] as string;

    if (argument === '--a' || argument === '--b') {
      const value = args[index + 1];
      if (value === undefined) return { ok: false, error: `ctxrent: ${argument} needs a path` };
      if (argument === '--a') options.a = value;
      else options.b = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('-')) {
      return { ok: false, error: `ctxrent: unknown option "${argument}"` };
    }
    if (options.taskSet !== undefined) {
      return { ok: false, error: `ctxrent: unexpected argument "${argument}"` };
    }
    options.taskSet = argument;
  }

  return { ok: true, options };
}

function parseAuditArgs(
  args: string[],
): { ok: true; options: AuditOptions } | { ok: false; error: string } {
  const options: AuditOptions = { target: undefined, json: false, all: false, html: null };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] as string;

    if (argument === '--json') {
      options.json = true;
      continue;
    }
    if (argument === '--all') {
      options.all = true;
      continue;
    }
    if (argument === '--html') {
      const value = args[index + 1];
      if (value === undefined) return { ok: false, error: 'ctxrent: --html needs a file path' };
      options.html = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('-')) {
      return { ok: false, error: `ctxrent: unknown option "${argument}"` };
    }
    if (options.target !== undefined) {
      return { ok: false, error: `ctxrent: unexpected argument "${argument}"` };
    }
    options.target = argument;
  }

  return { ok: true, options };
}

async function collectSessionFiles(target: string, deps: Deps): Promise<string[]> {
  const kind = await deps.kind(target);
  if (kind === 'file') return [target];
  if (kind === 'missing') return [];

  const entries = await deps.listDir(target);
  return entries.filter((name) => name.endsWith('.jsonl')).map((name) => join(target, name));
}

async function walkSessions(root: string, deps: Deps): Promise<string[]> {
  const found: string[] = [];

  const visit = async (path: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) return;

    const kind = await deps.kind(path);
    if (kind === 'missing') return;
    if (kind === 'file') {
      if (path.endsWith('.jsonl')) found.push(path);
      return;
    }

    let entries: string[];
    try {
      entries = await deps.listDir(path);
    } catch {
      return;
    }

    for (const entry of entries.sort()) {
      await visit(join(path, entry), depth + 1);
    }
  };

  await visit(root, 0);
  return found;
}

function failure(message: string): Result {
  return { exitCode: 1, stdout: '', stderr: `${message}\n` };
}

