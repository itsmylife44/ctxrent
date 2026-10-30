// npm runs this after `npm version` bumps package.json and before it commits:
// the skill must point at the release the new tag is about to create.
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const path = 'skills/ctxrent/SKILL.md';
const text = readFileSync(path, 'utf8')
  .replace(/releases\/download\/v[^/\s]+\/ctxrent-[^\s]+\.tgz/g, `releases/download/v${version}/ctxrent-${version}.tgz`)
  .replace(/version: "[^"]*"/, `version: "${version}"`);
writeFileSync(path, text);
