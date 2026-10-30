# 07: Aggregate over all sessions

**What to build:** `audit --all <root>` walks every recorded session under a root, reports a per-session line and the totals, and states how many sessions the totals are built from. This is the command behind the launch story.

**Blocked by:** 03.

**Status:** done

- [x] A root containing many sessions produces a per-session table and a total
- [x] The output states the number of sessions profiled and the share of records that yielded usable usage data
- [x] Malformed, truncated and unknown-version files are skipped without failing the run
- [x] An empty root exits non-zero with a diagnostic

## Comments

Implemented as `audit --all`, walking a root recursively with a depth cap.

- Malformed, truncated and unknown-version files are skipped without failing the run; a test audits a tree containing a garbage file.
- The summary states sessions profiled, sessions with usage, sessions without, and unmeasurable injections.
- An empty root exits non-zero with one diagnostic.
- Real data: 3,830 sessions and 132,533 turns in 18 seconds, 24.36 billion tokens, 8.18 billion token-turns of rent, 4.09 billion of waste.
