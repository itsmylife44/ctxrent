// npm runs this after `npm version` bumps package.json and before it commits:
// the skill states the version it was written for.
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const path = 'skills/ctxrent/SKILL.md';
writeFileSync(path, readFileSync(path, 'utf8').replace(/^  version: "[^"]*"$/m, `  version: "${version}"`));
