import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { AuditModel, SessionSummary } from './model.ts';
import { summariseSessions } from './model.ts';
import { parseSession } from './adapters/index.ts';
import { prescribe } from './prescriptions.ts';
import type { Deps } from './deps.ts';
import { renderText } from './report/text.ts';
import { renderHtml } from './report/html.ts';
import { renderDiff } from './report/diff.ts';
import { parseTaskSet, templateTaskSet } from './taskset.ts';
import { diffTaskSet } from './diff.ts';
import {
  composeBlock,
  instructionBlock,
  mergeBlock,
  mergeRules,
  readManagedRules,
  teach,
} from './teach.ts';
import type { TeachPlan } from './report/teach.ts';
import { renderTeach } from './report/teach.ts';
import { renderApplied, renderReview } from './report/review.ts';
import { startReview } from './review.ts';

export type Result = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const MAX_DEPTH = 8;
const MIN_SESSIONS = 3;
const RECENT_DAYS = 30;
const DEFAULT_TASK_SET = 'ctxrent.json';
const DEFAULT_MAX_WASTE = 40;

type AuditOptions = {
  target: string | undefined;
  json: boolean;
  all: boolean;
  html: string | null;
  open: boolean;
  since: number | null;
};

type DiffOptions = {
  taskSet: string | undefined;
  a: string | undefined;
  b: string | undefined;
};

type CheckOptions = {
  target: string | undefined;
  maxWaste: number;
  json: boolean;
  all: boolean;
  since: number | null;
};

type Loaded = { ok: true; model: AuditModel } | { ok: false; error: string };

export async function run(argv: string[], deps: Deps): Promise<Result> {
  try {
    return await dispatch(argv, deps);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failure(`ctxrent: ${message}`);
  }
}

const USAGE = `ctxrent measures the context rent of coding-agent sessions.

Usage
  ctxrent                        the session you just finished; in a terminal it then
                                 opens the review page, where the rules can be applied
  ctxrent audit <path>           a session file, or a directory of sessions
      --all                      walk the path recursively
      --since <date>             only sessions modified since then
      --json                     print the model instead of the report
      --html [file]              write a single-file report and open it;
                                 without a file, a temporary one is used
      --no-open                  write the report without opening it
  ctxrent check [path]           exit 0 under the threshold, 1 over, 2 cannot measure
      --max-waste <pct>          threshold, default 40
      --all                      walk the path recursively
      --since <date>             only sessions modified since then
      --json                     print the assertion as JSON
  ctxrent teach [path]           rules with evidence, dry run by default
      --write <file>             show the change, ask, then apply the managed block
      --yes                      skip the question, for scripted use
      --min-sessions <n>         evidence threshold, default 3
  ctxrent review [path]          the same choice in the browser, loopback only
      --write <file>             target shown in the page
  ctxrent init [file]            write a task-set template (default ctxrent.json)
  ctxrent diff <task-set> --a <dir> --b <dir>
                                 run both variants and compare rent and success

Records are read from ~/.claude/projects and ~/.codex/sessions, and the adapter
is detected from the file itself. Nothing leaves the machine.
`;

async function dispatch(argv: string[], deps: Deps): Promise<Result> {
  if (argv.length === 0) return runLatest(deps);

  const [command, ...rest] = argv;

  if (command === '--help' || command === '-h' || command === 'help') {
    return { exitCode: 0, stdout: USAGE, stderr: '' };
  }

  if (command === 'audit') return runAudit(rest, deps);
  if (command === 'check') return runCheck(rest, deps);
  if (command === 'teach') return runTeach(rest, deps);
  if (command === 'review') return runReview(rest, deps);
  if (command === 'init') return runInit(rest, deps);
  if (command === 'diff') return runDiff(rest, deps);

  return failure(`ctxrent: unknown command "${command}"`);
}

/** No arguments: the session you just finished is the one you care about. */
async function runLatest(deps: Deps): Promise<Result> {
  const file = await latestSessionFile(deps);
  if (file === null) return failure('ctxrent: no sessions found');

  const result = await runAudit([file], deps);
  if (!deps.interactive || result.exitCode !== 0) return result;

  // Where a person is waiting, the useful surface is the page you can act on, not a file on disk.
  const recent = await recentFiles(deps, RECENT_DAYS);
  const files = recent.length >= MIN_SESSIONS ? recent : await allFiles(deps);

  deps.notify(result.stdout);
  deps.notify('\n');

  return openReview(files, deps, await deps.defaultInstructionFile(), MIN_SESSIONS);
}

/** Sessions touched recently: the rules worth writing down come from this month, not from 2024. */
async function recentFiles(deps: Deps, days: number): Promise<string[]> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const files: string[] = [];

  for (const root of await deps.defaultRoots()) {
    for (const file of await walkSessions(root, deps)) {
      if ((await deps.modifiedAt(file)) >= cutoff) files.push(file);
    }
  }

  return files;
}

async function allFiles(deps: Deps): Promise<string[]> {
  const files: string[] = [];
  for (const root of await deps.defaultRoots()) files.push(...(await walkSessions(root, deps)));
  return files;
}

function defaultReportPath(label: string): string {
  const safe = label.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40) || 'report';
  return join(tmpdir(), `ctxrent-${safe}.html`);
}

async function runAudit(args: string[], deps: Deps): Promise<Result> {
  const parsed = parseAuditArgs(args);
  if (!parsed.ok) return failure(parsed.error);

  const { target, json, all, html, open, since } = parsed.options;
  if (target === undefined) return failure('ctxrent: audit needs a session path');

  const loaded = await loadSessions(target, deps, all, since);
  if (!loaded.ok) return failure(loaded.error);

  if (json) {
    return { exitCode: 0, stdout: `${JSON.stringify(loaded.model, null, 2)}\n`, stderr: '' };
  }
  if (html !== null) {
    const path =
      html === '' ? defaultReportPath(loaded.model.sessions[0]?.sessionId ?? 'report') : html;
    await deps.writeArtifact(path, renderHtml(loaded.model));

    // A report exists to be looked at, but opening a browser is only right where a person is
    // waiting: in a pipe or a CI job the path is the useful output.
    const shouldOpen = open && deps.interactive;
    if (shouldOpen) await deps.openUrl(resolve(path));

    return {
      exitCode: 0,
      stdout: `wrote ${path}${shouldOpen ? ' and opened it' : ''}\n`,
      stderr: '',
    };
  }
  return { exitCode: 0, stdout: renderText(loaded.model), stderr: '' };
}

/**
 * The gate. Exit codes follow the contract developers already know from ESLint and Lighthouse CI:
 * 0 under the threshold, 1 over it, 2 when the record cannot be measured — never a silent pass.
 */
async function runCheck(args: string[], deps: Deps): Promise<Result> {
  const parsed = parseCheckArgs(args);
  if (!parsed.ok) return failure(parsed.error);

  const { maxWaste, json, all, since } = parsed.options;

  let loaded: Loaded;
  if (parsed.options.target === undefined && all) {
    loaded = await loadFromRoots(await deps.defaultRoots(), deps, since);
  } else {
    const target = parsed.options.target ?? (await latestSessionFile(deps));
    if (target === null) return failure('ctxrent: no sessions found');
    loaded = await loadSessions(target, deps, all, since);
  }
  if (!loaded.ok) return failure(loaded.error);

  const { rent, wasteRent } = loaded.model.totals;
  if (rent === null || wasteRent === null) {
    return {
      exitCode: 2,
      stdout: json ? `${JSON.stringify({ expected: maxWaste, actual: null, operator: '<=', passed: false })}\n` : '',
      stderr: 'ctxrent: cannot measure waste for this target\n',
    };
  }

  const actual = Math.round((100 * wasteRent) / rent);
  const passed = actual <= maxWaste;

  if (json) {
    return {
      exitCode: passed ? 0 : 1,
      stdout: `${JSON.stringify({ expected: maxWaste, actual, operator: '<=', passed })}\n`,
      stderr: '',
    };
  }

  const headline = `waste ${actual}% (max ${maxWaste}%) ${passed ? 'ok' : `— over by ${actual - maxWaste} points`}`;
  if (passed) return { exitCode: 0, stdout: `${headline}\n`, stderr: '' };

  const advice = prescribe({
    claims: loaded.model.sessions.flatMap((session) => session.waste),
    carriers: loaded.model.sessions.flatMap((session) => session.carriers),
    rent: loaded.model.totals.rent,
  });
  const lines = [headline, ''];
  if (advice.length === 0) {
    lines.push('no rule could classify this waste');
  } else {
    lines.push('what to change');
    for (const [index, item] of advice.entries()) {
      lines.push(`  ${index + 1}. ${item.advice}`);
      lines.push(`     would have saved ${item.saving.toLocaleString('en-US')} token-turns`);
    }
  }

  return { exitCode: 1, stdout: `${lines.join('\n')}\n`, stderr: '' };
}

async function parseFiles(
  files: string[],
  deps: Deps,
): Promise<{ sessions: SessionSummary[]; records: number }> {
  const sessions: SessionSummary[] = [];
  let records = 0;

  for (const file of files) {
    let text: string;
    try {
      text = await deps.readText(file);
    } catch {
      continue;
    }
    const parsed = parseSession(text, basename(file, '.jsonl'));
    records += parsed.records;
    sessions.push(parsed.session);
  }

  return { sessions, records };
}

async function filterSince(files: string[], deps: Deps, since: number | null): Promise<string[]> {
  if (since === null) return files;

  const kept: string[] = [];
  for (const file of files) {
    if ((await deps.modifiedAt(file)) >= since) kept.push(file);
  }
  return kept;
}

async function loadFromRoots(
  roots: string[],
  deps: Deps,
  since: number | null = null,
): Promise<Loaded> {
  const files: string[] = [];
  for (const root of roots) files.push(...(await walkSessions(root, deps)));

  if (files.length === 0) return { ok: false, error: 'ctxrent: no sessions found' };

  const { sessions, records } = await parseFiles(files, deps);
  if (records === 0) return { ok: false, error: 'ctxrent: no readable sessions' };

  return { ok: true, model: summariseSessions(sessions) };
}

async function loadSessions(
  target: string,
  deps: Deps,
  all: boolean,
  since: number | null = null,
): Promise<Loaded> {
  const collected = all
    ? await walkSessions(target, deps)
    : await collectSessionFiles(target, deps);
  const sessionFiles = await filterSince(collected, deps, since);

  if (sessionFiles.length === 0) {
    return { ok: false, error: `ctxrent: no sessions found under ${target}` };
  }

  const { sessions, records } = await parseFiles(sessionFiles, deps);
  if (records === 0) return { ok: false, error: `ctxrent: no readable sessions under ${target}` };

  return { ok: true, model: summariseSessions(sessions) };
}

async function runTeach(args: string[], deps: Deps): Promise<Result> {
  const parsed = parseTeachArgs(args);
  if (!parsed.ok) return failure(parsed.error);

  const { target, write, minSessions, yes } = parsed.options;

  const files: string[] = [];
  if (target === undefined) {
    for (const root of await deps.defaultRoots()) files.push(...(await walkSessions(root, deps)));
  } else {
    files.push(...(await walkSessions(target, deps)));
  }

  if (files.length === 0) return failure('ctxrent: no sessions found');

  const { sessions, records } = await parseFiles(files, deps);
  if (records === 0) return failure('ctxrent: no readable sessions');

  const model = summariseSessions(sessions);
  const teachings = teach(sessions, { minSessions });
  let block = instructionBlock(teachings, sessions.length);

  let plan: TeachPlan | null = null;
  if (write !== null) {
    let existing: string | null = null;
    try {
      existing = await deps.readText(write);
    } catch {
      existing = null;
    }

    // An update composes with what is already there: dropping a rule the user approved earlier
    // because it fell below today's threshold would be a silent loss.
    const proposed = teachings
      .filter((item) => item.lever === 'instruction')
      .map((item) => ({ id: item.id, advice: item.advice }));
    block = composeBlock(mergeRules(readManagedRules(existing), proposed), sessions.length);

    plan = { path: write, state: stateOf(existing), content: mergeBlock(existing, block) };
  }

  const base = {
    teachings,
    sessionCount: sessions.length,
    turns: model.totals.turns,
    block,
    plan,
  };

  if (plan === null) {
    return { exitCode: 0, stdout: renderTeach({ ...base, outcome: 'preview' }), stderr: '' };
  }

  // Never edit a file the agent reads in every session without an explicit yes.
  let approved = yes;
  if (!approved) {
    if (!deps.interactive) {
      return {
        exitCode: 1,
        stdout: renderTeach({ ...base, outcome: 'preview' }),
        stderr:
          'ctxrent: refusing to edit an instruction file without confirmation; re-run with --yes\n',
      };
    }
    const rules = teachings.filter((item) => item.lever === 'instruction').length;
    approved = await deps.confirm(
      `Apply ${rules} rule(s) to ${plan.path}? This changes how your agent behaves everywhere. [y/N] `,
    );
  }

  if (!approved) {
    return { exitCode: 0, stdout: renderTeach({ ...base, outcome: 'declined' }), stderr: '' };
  }

  await deps.writeArtifact(plan.path, plan.content);
  return { exitCode: 0, stdout: renderTeach({ ...base, outcome: 'applied' }), stderr: '' };
}

async function openReview(
  files: string[],
  deps: Deps,
  destination: string,
  minSessions: number,
): Promise<Result> {
  if (files.length === 0) return failure('ctxrent: no sessions found');

  const { sessions, records } = await parseFiles(files, deps);
  if (records === 0) return failure('ctxrent: no readable sessions');

  const model = summariseSessions(sessions);
  const teachings = teach(sessions, { minSessions });
  const applicable = teachings.filter((item) => item.lever === 'instruction');

  if (applicable.length === 0) {
    return {
      exitCode: 0,
      stdout: 'nothing recurs in enough sessions to be worth writing down\n',
      stderr: '',
    };
  }

  let before: string | null = null;
  try {
    before = await deps.readText(destination);
  } catch {
    before = null;
  }

  const state: { applied: { target: string; rules: number } | null } = { applied: null };

  const server = await startReview({
    renderPage: (token) =>
      renderReview({
        token,
        model,
        teachings,
        target: destination,
        existingRules: readManagedRules(before),
      }),
    onApply: async (rules, keep, requestedTarget) => {
      let current: string | null = null;
      try {
        current = await deps.readText(requestedTarget);
      } catch {
        current = null;
      }

      const selected = teachings
        .filter((item) => item.lever === 'instruction' && rules.includes(item.id))
        .map((item) => ({ id: item.id, advice: item.advice }));

      // What was already in the file stays, with whatever wording it has, unless unticked.
      const existing = readManagedRules(current).filter((rule) => keep.includes(rule.advice));
      const block = composeBlock(mergeRules(existing, selected), sessions.length);
      await deps.writeArtifact(requestedTarget, mergeBlock(current, block));
      state.applied = { target: requestedTarget, rules: selected.length };
      return renderApplied({ rules, target: requestedTarget, block });
    },
  });

  deps.notify(`review open at ${server.url}\n`);
  deps.notify(`target ${destination}\n`);
  deps.notify('waiting for your decision in the browser; nothing is written until you apply\n');

  await deps.openUrl(server.url);
  await server.done;
  await server.close();

  return {
    exitCode: 0,
    stdout:
      state.applied === null
        ? 'closed without changes\n'
        : `applied ${state.applied.rules} rule(s) to ${state.applied.target}\n`,
    stderr: '',
  };
}

async function runReview(args: string[], deps: Deps): Promise<Result> {
  const parsed = parseReviewArgs(args);
  if (!parsed.ok) return failure(parsed.error);

  const { target, file, minSessions } = parsed.options;

  const files: string[] = [];
  if (target === undefined) {
    for (const root of await deps.defaultRoots()) files.push(...(await walkSessions(root, deps)));
  } else {
    files.push(...(await walkSessions(target, deps)));
  }
  if (files.length === 0) return failure('ctxrent: no sessions found');

  const { sessions, records } = await parseFiles(files, deps);
  if (records === 0) return failure('ctxrent: no readable sessions');

  const destination = file ?? (await deps.defaultInstructionFile());
  return openReview(files, deps, destination, minSessions);
}

function parseReviewArgs(
  args: string[],
):
  | { ok: true; options: { target: string | undefined; file: string | null; minSessions: number } }
  | { ok: false; error: string } {
  const options = {
    target: undefined as string | undefined,
    file: null as string | null,
    minSessions: 3,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] as string;

    if (argument === '--write') {
      const value = args[index + 1];
      if (value === undefined) return { ok: false, error: 'ctxrent: --write needs a file path' };
      options.file = value;
      index += 1;
      continue;
    }
    if (argument === '--min-sessions') {
      const value = args[index + 1];
      if (value === undefined) return { ok: false, error: 'ctxrent: --min-sessions needs a number' };
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return { ok: false, error: 'ctxrent: --min-sessions must be a positive integer' };
      }
      options.minSessions = parsed;
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

function stateOf(existing: string | null): TeachPlan['state'] {
  if (existing === null || existing.trim() === '') return 'a new file';
  return existing.includes('<!-- ctxrent:begin -->')
    ? 'replaces its managed block'
    : 'appends a block';
}

function parseTeachArgs(
  args: string[],
): { ok: true; options: { target: string | undefined; write: string | null; minSessions: number; yes: boolean } } | { ok: false; error: string } {
  const options = {
    target: undefined as string | undefined,
    write: null as string | null,
    minSessions: 3,
    yes: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] as string;

    if (argument === '--yes' || argument === '-y') {
      options.yes = true;
      continue;
    }

    if (argument === '--write') {
      const value = args[index + 1];
      if (value === undefined) return { ok: false, error: 'ctxrent: --write needs a file path' };
      options.write = value;
      index += 1;
      continue;
    }
    if (argument === '--min-sessions') {
      const value = args[index + 1];
      if (value === undefined) return { ok: false, error: 'ctxrent: --min-sessions needs a number' };
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return { ok: false, error: 'ctxrent: --min-sessions must be a positive integer' };
      }
      options.minSessions = parsed;
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

function parseCheckArgs(
  args: string[],
): { ok: true; options: CheckOptions } | { ok: false; error: string } {
  const options: CheckOptions = {
    target: undefined,
    maxWaste: DEFAULT_MAX_WASTE,
    json: false,
    all: false,
    since: null,
  };

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
    if (argument === '--since') {
      const value = args[index + 1];
      if (value === undefined) return { ok: false, error: 'ctxrent: --since needs a date' };
      const parsed = Date.parse(value);
      if (Number.isNaN(parsed)) {
        return { ok: false, error: `ctxrent: --since "${value}" is not a date` };
      }
      options.since = parsed;
      index += 1;
      continue;
    }
    if (argument === '--max-waste') {
      const value = args[index + 1];
      if (value === undefined) return { ok: false, error: 'ctxrent: --max-waste needs a percentage' };
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        return { ok: false, error: 'ctxrent: --max-waste must be between 0 and 100' };
      }
      options.maxWaste = parsed;
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
  const options: AuditOptions = {
    target: undefined,
    json: false,
    all: false,
    html: null,
    open: true,
    since: null,
  };

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
    if (argument === '--no-open') {
      options.open = false;
      continue;
    }
    if (argument === '--since') {
      const value = args[index + 1];
      if (value === undefined) return { ok: false, error: 'ctxrent: --since needs a date' };
      const parsed = Date.parse(value);
      if (Number.isNaN(parsed)) {
        return { ok: false, error: `ctxrent: --since "${value}" is not a date` };
      }
      options.since = parsed;
      index += 1;
      continue;
    }
    if (argument === '--html') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('-')) {
        options.html = '';
        continue;
      }
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

async function latestSessionFile(deps: Deps): Promise<string | null> {
  let best: string | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;

  for (const root of await deps.defaultRoots()) {
    for (const file of await walkSessions(root, deps)) {
      const time = await deps.modifiedAt(file);
      if (time > bestTime) {
        bestTime = time;
        best = file;
      }
    }
  }

  return best;
}

function failure(message: string): Result {
  return { exitCode: 1, stdout: '', stderr: `${message}\n` };
}
