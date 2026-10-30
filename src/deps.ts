import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export type PathKind = 'file' | 'directory' | 'missing';

/** How a shell command is run on this platform. Windows has no `sh`. */
export function shellFor(
  platform: NodeJS.Platform,
  command: string,
): { file: string; args: string[] } {
  return platform === 'win32'
    ? { file: 'cmd.exe', args: ['/d', '/s', '/c', command] }
    : { file: 'sh', args: ['-c', command] };
}

/**
 * Windows cannot spawn a `.cmd` shim without a shell, so arguments are joined into one command
 * line. Inside double quotes cmd treats `""` as a literal quote.
 */
export function quoteWindowsArgument(value: string): string {
  if (value === '') return '""';
  if (!/[\s"&|<>^()]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

export function fileInvocation(
  platform: NodeJS.Platform,
  file: string,
  args: string[],
): { file: string; args: string[] } {
  if (platform !== 'win32') return { file, args };
  return {
    file: 'cmd.exe',
    args: ['/d', '/s', '/c', [file, ...args].map(quoteWindowsArgument).join(' ')],
  };
}

/**
 * How a file or URL is handed to the default application. Windows uses explorer for paths and
 * rundll32 for URLs: going through `cmd /c start` means Node's own quoting produces `\"`, which
 * cmd reads as a literal backslash and fails with "cannot find '\\'".
 */
export function openFor(
  platform: NodeJS.Platform,
  target: string,
): { file: string; args: string[] } {
  if (platform === 'win32') {
    return /^https?:\/\//i.test(target)
      ? { file: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', target] }
      : { file: 'explorer.exe', args: [target] };
  }
  if (platform === 'darwin') return { file: 'open', args: [target] };
  return { file: 'xdg-open', args: [target] };
}

export type ExecResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type Deps = {
  kind(path: string): Promise<PathKind>;
  listDir(path: string): Promise<string[]>;
  readText(path: string): Promise<string>;
  writeArtifact(path: string, content: string): Promise<void>;
  exec(command: string, cwd: string): Promise<ExecResult>;
  execFile(file: string, args: string[], cwd: string): Promise<ExecResult>;
  copyDir(from: string, to: string): Promise<void>;
  makeTempDir(prefix: string): Promise<string>;
  removeDir(path: string): Promise<void>;
  defaultRoots(): Promise<string[]>;
  modifiedAt(path: string): Promise<number>;
  /** True when a human is present to answer a question. */
  interactive: boolean;
  confirm(question: string): Promise<boolean>;
  which(binary: string): Promise<boolean>;
  defaultInstructionFile(): Promise<string>;
  openUrl(url: string): Promise<void>;
  /** Writes immediately, for progress that must appear before a long wait. */
  notify(message: string): void;
};

function collect(
  file: string,
  args: string[],
  cwd: string,
  verbatim = false,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(file, args, { cwd, windowsVerbatimArguments: verbatim });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error: Error) => {
      resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on('close', (code: number | null) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export const nodeDeps: Deps = {
  async kind(path) {
    try {
      const stats = await stat(path);
      if (stats.isDirectory()) return 'directory';
      if (stats.isFile()) return 'file';
      return 'missing';
    } catch {
      return 'missing';
    }
  },
  listDir(path) {
    return readdir(path);
  },
  readText(path) {
    return readFile(path, 'utf8');
  },
  async writeArtifact(path, content) {
    await writeFile(path, content, 'utf8');
  },
  exec(command, cwd) {
    const shell = shellFor(process.platform, command);
    // On Windows the command is one pre-built string for cmd.exe: quoting it again would break it.
    return collect(shell.file, shell.args, cwd, process.platform === 'win32');
  },
  execFile(file, args, cwd) {
    const invocation = fileInvocation(process.platform, file, args);
    return collect(invocation.file, invocation.args, cwd, process.platform === 'win32');
  },
  async copyDir(from, to) {
    await cp(from, to, { recursive: true });
  },
  makeTempDir(prefix) {
    return mkdtemp(join(tmpdir(), prefix));
  },
  async removeDir(path) {
    await rm(path, { recursive: true, force: true });
  },
  async defaultRoots() {
    return [join(homedir(), '.claude', 'projects'), join(homedir(), '.codex', 'sessions')];
  },
  async modifiedAt(path) {
    try {
      return (await stat(path)).mtimeMs;
    } catch {
      return 0;
    }
  },
  interactive: process.stdin.isTTY === true,
  async defaultInstructionFile() {
    return join(homedir(), '.claude', 'CLAUDE.md');
  },
  notify(message) {
    process.stdout.write(message);
  },
  async openUrl(url) {
    const opener = openFor(process.platform, url);
    await new Promise<void>((resolve) => {
      const child = spawn(opener.file, opener.args, { stdio: 'ignore', detached: true });
      child.on('error', () => resolve());
      child.unref();
      resolve();
    });
  },
  which(binary) {
    if (!/^[A-Za-z0-9_-]+$/.test(binary)) return Promise.resolve(false);

    const probe =
      process.platform === 'win32'
        ? { file: 'where', args: [binary] }
        : { file: 'sh', args: ['-c', `command -v ${binary}`] };

    return new Promise((resolve) => {
      const child = spawn(probe.file, probe.args, { stdio: 'ignore' });
      child.on('error', () => resolve(false));
      child.on('close', (code: number | null) => resolve(code === 0));
    });
  },
  async confirm(question) {
    const reader = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await reader.question(question);
      return /^(y|yes|s|si|sì)$/i.test(answer.trim());
    } finally {
      reader.close();
    }
  },
};
