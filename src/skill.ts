import { readFileSync } from 'node:fs';

/**
 * The skill is a real file in `skills/ctxrent/SKILL.md`, so `npx skills add` can install it and
 * there is only one copy of the text. Read relative to this module: works from src/ and from dist/.
 */
export function skillText(): string {
  try {
    return readFileSync(new URL('../skills/ctxrent/SKILL.md', import.meta.url), 'utf8');
  } catch {
    return 'ctxrent: the bundled skill is missing (skills/ctxrent/SKILL.md)\n';
  }
}
