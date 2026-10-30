import { basename, join } from 'node:path';
import type { AuditModel, SessionSummary } from './model.ts';
import { summariseSessions } from './model.ts';
import { parseClaudeCodeSession } from './adapters/claude-code.ts';
import type { Deps } from './deps.ts';

export type Result = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const formatNumber = new Intl.NumberFormat('en-US');
const knownOptions = new Set(['--json']);

export async function run(argv: string[], deps: Deps): Promise<Result> {
  const [command, target, ...options] = argv;

  if (command !== 'audit') {
    return failure(`ctxrent: unknown command ${command === undefined ? '(none)' : `"${command}"`}`);
  }

  const unknownOption = options.find((option) => !knownOptions.has(option));
  if (unknownOption !== undefined) {
    return failure(`ctxrent: unknown option "${unknownOption}"`);
  }

  if (target === undefined) {
    return failure('ctxrent: audit needs a session path');
  }

  const sessionFiles = await collectSessionFiles(target, deps);
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
    const parsed = parseClaudeCodeSession(text, basename(file, '.jsonl'));
    records += parsed.records;
    sessions.push(parsed.session);
  }

  if (records === 0) {
    return failure(`ctxrent: no readable sessions under ${target}`);
  }

  const model = summariseSessions(sessions);
  const stdout = options.includes('--json') ? `${JSON.stringify(model, null, 2)}\n` : render(model);
  return { exitCode: 0, stdout, stderr: '' };
}

async function collectSessionFiles(target: string, deps: Deps): Promise<string[]> {
  const kind = await deps.kind(target);
  if (kind === 'file') return [target];
  if (kind === 'missing') return [];

  const entries = await deps.listDir(target);
  return entries.filter((name) => name.endsWith('.jsonl')).map((name) => join(target, name));
}

function render(model: AuditModel): string {
  const lines = model.sessions.map((session) => {
    const spend =
      session.tokens === null
        ? 'tokens unavailable'
        : `${formatNumber.format(session.tokens.total)} tokens`;
    return `${session.sessionId}  ${session.turns.length} turns  ${spend}`;
  });

  const unmeasured =
    model.totals.unmeasuredSessions === 0
      ? ''
      : `  (${model.totals.unmeasuredSessions} without usage)`;
  lines.push(
    `total  ${model.totals.turns} turns  ${formatNumber.format(model.totals.tokens.total)} tokens${unmeasured}`,
  );
  return `${lines.join('\n')}\n`;
}

function failure(message: string): Result {
  return { exitCode: 1, stdout: '', stderr: `${message}\n` };
}
