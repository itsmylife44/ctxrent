# 10: Task set and verifier

**What to build:** A declared task set is validated, each task's verifier decides success by exit code, and each task is repeated the declared number of times. Invalid declarations fail loudly before any run starts.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] `ctxrent init` writes a template task set that validates as-is
- [ ] An invalid task set exits non-zero naming the offending field, with no run attempted
- [ ] A verifier exiting 0 counts as success and any other exit code as failure
- [ ] Each task runs the declared number of times and the per-task outcome is reported
