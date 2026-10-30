import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export type PathKind = 'file' | 'directory' | 'missing';

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
  copyDir(from: string, to: string): Promise<void>;
  makeTempDir(prefix: string): Promise<string>;
  removeDir(path: string): Promise<void>;
  defaultRoots(): Promise<string[]>;
  modifiedAt(path: string): Promise<number>;
  /** True when a human is present to answer a question. */
  interactive: boolean;
  confirm(question: string): Promise<boolean>;
  defaultInstructionFile(): Promise<string>;
  openUrl(url: string): Promise<void>;
  /** Writes immediately, for progress that must appear before a long wait. */
  notify(message: string): void;
};

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
    return new Promise((resolve) => {
      const child = spawn('sh', ['-c', command], { cwd });
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
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    await new Promise<void>((resolve) => {
      const child = spawn(opener, [url], { stdio: 'ignore', detached: true });
      child.on('error', () => resolve());
      child.unref();
      resolve();
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
