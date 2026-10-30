# 03: The residual is clamped and never shown

**What to build:** ADR-0004 says the reconstruction reports a residual and never clamps it. The text and HTML reports show only coverage, clamped at `src/assemble.ts:59`; a real Codex session showed 100% coverage with a residual of −186,779. Show the residual, and say when it is negative (the reconstruction over-counts).

**Status:** ready-for-agent

- [ ] Text and HTML reports print the residual
- [ ] A negative residual is labelled, not hidden behind 100% coverage
