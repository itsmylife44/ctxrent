# 10: Task set and verifier

**What to build:** A declared task set is validated, each task's verifier decides success by exit code, and each task is repeated the declared number of times. Invalid declarations fail loudly before any run starts.

**Blocked by:** 01.

**Status:** done

- [x] `ctxrent init` writes a template task set that validates as-is
- [x] An invalid task set exits non-zero naming the offending field, with no run attempted
- [x] A verifier exiting 0 counts as success and any other exit code as failure
- [x] Each task runs the declared number of times and the per-task outcome is reported

## Comments

Implemented in `src/taskset.ts`.

- JSON, chosen over a YAML subset so a broken declaration cannot be misparsed.
- Validation names the offending field and runs before anything is executed: a test proves no process starts on an invalid task set.
- `ctxrent init` writes a template that validates as it is, and refuses to overwrite an existing file.
- The verifier's exit code is the only judge: 0 is success, anything else is failure.
