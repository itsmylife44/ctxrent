# 06: run.ts carries six near-identical argument parsers

**What to build:** `src/run.ts` is over 1,000 lines; six `parse*Args` functions and five copies of parse-then-summarise. Fold them into one parser over a per-command flag table and one loader. Behaviour must not change: the suite is the safety net. Also `Date.now`, `process.cwd` and `createServer` bypass `Deps`, and test helpers spread `...nodeDeps` (the leak behind commit b8e623e).

**Status:** needs-triage

- [ ] One parser, one loader, the suite unchanged and green
