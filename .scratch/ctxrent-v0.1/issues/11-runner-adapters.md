# 11: Runner adapters

**What to build:** Both supported agents can execute a task from a task set in an isolated working copy, and their output is captured into the same session model that `audit` reads.

**Blocked by:** 10.

**Status:** done

- [x] Each runner executes one declared task in a fresh working copy and returns a session model
- [x] A runner that is not installed is reported as unavailable, not as a failed task
- [x] The runner boundary is exercised in tests through a fake, with no real agent invoked
- [x] Files written during a run never escape the working copy

## Comments

Implemented in `src/runner.ts` behind the injected `exec`, so no test ever launches an agent.

- `claude -p --output-format stream-json --verbose` and `codex exec --json`, with the prompt shell-quoted.
- The agent's stream is parsed with the same adapters `audit` uses, so a run and a recorded session share one model.
- Exit code 127 is reported as `runner "x" is not available` and aborts the diff; it is never counted as a failed task.
- Every run gets its own temp working copy, and a test asserts 12 distinct copies created and all 12 removed.
