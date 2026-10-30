# 01: Walking skeleton

**What to build:** `ctxrent audit <path>` reads one recorded session produced by Claude Code and prints the number of turns and the total tokens the session spent. The command runs end to end with no network and no dependency, and `--json` returns the same facts as a model.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] On a real session directory, `audit` prints turn count and total tokens and exits 0
- [x] `--json` prints a model containing the session identifier, the turn count and the token totals
- [x] A path with no readable sessions exits non-zero with a single diagnostic and prints nothing else
- [x] No network call is made and no file is written

## Comments

Implemented with TDD at the agreed seam (`run(argv, deps)`), 7 tests, typecheck clean.

Findings that shaped the implementation:

- Claude Code writes one `assistant` record per content block, so `usage` repeats identically for the same `message.id`. Counting records inflates totals roughly 2x (485 records vs 235 real requests in a sampled session). Records are deduplicated by `message.id`, and a test locks the behaviour by asserting 852 rather than the naive 1174.
- A turn is counted from the message id alone, not from the presence of `usage`, otherwise a session that records turns without usage reports zero turns.
- Code review flagged four defects, all fixed: a file path leaking into `sessionId`, unknown options exiting 0, an unreadable file throwing out of `run`, and missing usage surfacing as a confident `0 tokens` instead of `null`.
- Verified on real data: one session reports 232 turns and 52,794,243 tokens, about 227k tokens per turn — consistent with the context-rent thesis.

