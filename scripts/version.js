// npm runs this after `npm version` bumps package.json and before it commits:
// the skill and the README must point at the release the new tag is about to create.
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const release = /releases\/download\/v[^/\s]+\/ctxrent-[^\s]+\.tgz/g;

for (const path of ['skills/ctxrent/SKILL.md', 'README.md']) {
  const text = readFileSync(path, 'utf8')
    .replace(release, `releases/download/v${version}/ctxrent-${version}.tgz`)
    .replace(/^  version: "[^"]*"$/m, `  version: "${version}"`);
  writeFileSync(path, text);
}
