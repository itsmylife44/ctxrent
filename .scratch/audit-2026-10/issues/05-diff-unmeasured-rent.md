# 05: diff treats an unmeasured run as free

**What to build:** `src/diff.ts:64` does `rent ?? 0`, so a run whose rent cannot be measured makes its variant look cheaper. An unmeasured run must make the rent delta unavailable, not zero.

**Status:** ready-for-agent

- [ ] A variant with one unmeasured run reports the rent delta as unavailable
