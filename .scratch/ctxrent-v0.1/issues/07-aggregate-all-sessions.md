# 07: Aggregate over all sessions

**What to build:** `audit --all <root>` walks every recorded session under a root, reports a per-session line and the totals, and states how many sessions the totals are built from. This is the command behind the launch story.

**Blocked by:** 03.

**Status:** ready-for-agent

- [ ] A root containing many sessions produces a per-session table and a total
- [ ] The output states the number of sessions profiled and the share of records that yielded usable usage data
- [ ] Malformed, truncated and unknown-version files are skipped without failing the run
- [ ] An empty root exits non-zero with a diagnostic
