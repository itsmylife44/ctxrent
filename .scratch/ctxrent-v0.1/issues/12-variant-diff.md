# 12: Variant diff

**What to build:** `ctxrent diff <task-set>` runs two variants over the same task set and reports the difference in rent and in success rate, so a change to a skill or an instruction file is decided on evidence.

**Blocked by:** 11, 03.

**Status:** ready-for-agent

- [ ] Both variants run over the same task set and the same repeat count
- [ ] The report states the rent delta, the success-rate delta and the per-task outcomes
- [ ] A task that fails for both variants is named separately from a task that regressed
- [ ] An unavailable runner or an invalid task set exits non-zero before either variant starts
