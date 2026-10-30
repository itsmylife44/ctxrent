# 01: Codex sessions never get a waste figure

**What to build:** `src/adapters/codex.ts:79` names a carrier by the tool alone (`exec`), so no waste rule can tell two calls apart and every Codex session reports waste and score as unavailable; `check` exits 2 on any Codex session. Build the carrier from the call's arguments (`carrierOf(name, JSON.parse(arguments))`), as the Claude Code adapter does. Real Codex logs also repeat identical `token_count` events (13 of 722 in one file); each becomes an extra turn and adds rent. Skip a `token_count` identical to the previous one.

**Status:** ready-for-agent

- [ ] A Codex fixture with two different `exec` calls produces two carriers
- [ ] A repeated identical `token_count` does not add a turn
- [ ] `check` on a Codex session with waste exits 0 or 1, not 2
