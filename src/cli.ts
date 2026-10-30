#!/usr/bin/env node
import { run } from './run.ts';
import { nodeDeps } from './deps.ts';

const result = await run(process.argv.slice(2), nodeDeps);
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
