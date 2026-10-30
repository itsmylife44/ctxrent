# 11: Runner adapters

**What to build:** Both supported agents can execute a task from a task set in an isolated working copy, and their output is captured into the same session model that `audit` reads.

**Blocked by:** 10.

**Status:** ready-for-agent

- [ ] Each runner executes one declared task in a fresh working copy and returns a session model
- [ ] A runner that is not installed is reported as unavailable, not as a failed task
- [ ] The runner boundary is exercised in tests through a fake, with no real agent invoked
- [ ] Files written during a run never escape the working copy
