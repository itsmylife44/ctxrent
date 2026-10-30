# 12: Variant diff

**What to build:** `ctxrent diff <task-set>` runs two variants over the same task set and reports the difference in rent and in success rate, so a change to a skill or an instruction file is decided on evidence.

**Blocked by:** 11, 03.

**Status:** done

- [x] Both variants run over the same task set and the same repeat count
- [x] The report states the rent delta, the success-rate delta and the per-task outcomes
- [x] A task that fails for both variants is named separately from a task that regressed
- [x] An unavailable runner or an invalid task set exits non-zero before either variant starts

## Comments

Implemented in `src/diff.ts` and `src/report/diff.ts`.

- Both variants run over the same task set and the same repeat count.
- The report states rent and success deltas, and labels each task `regressed`, `improved`, or `fails in both`, so a pre-existing failure is never read as a regression.
- An unavailable runner or an invalid task set exits non-zero before either variant starts.
- Tested end to end with a fake runner: 12 agent invocations, deltas of -3,000 rent and -2 successes on a 3-task, 2-repeat set.
