import { readFile, readdir, stat } from 'node:fs/promises';

export type PathKind = 'file' | 'directory' | 'missing';

export type Deps = {
  kind(path: string): Promise<PathKind>;
  listDir(path: string): Promise<string[]>;
  readText(path: string): Promise<string>;
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
};
