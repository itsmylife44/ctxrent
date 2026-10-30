# ctxrent v0.1 — context rent audit and variant diff

## Problem Statement

A coding agent's context is the most expensive thing it owns, and nobody can see how it is spent. Providers show token totals, observability tools show traces: neither answers *which content is expensive*, *how long it stayed expensive*, and *what would change if I fixed it*. A file read early in a session keeps being re-read on every later request, so an early mistake costs many times a late one — an asymmetry no existing tool surfaces. As a result, instruction files, skills and tool configurations are adopted on vibes: one session cannot be compared to another, because they differ in length, task, and environment. People ship bloated setups and pay for them on every turn.

## Solution

`ctxrent` reads an agent's recorded sessions locally, reconstructs what entered the context at each request, and reports **context rent** in token-turns, broken down by carrier and by waste class. Nothing leaves the machine and nothing is uploaded. On top of that, `ctxrent diff` executes a declared task set against two variants and reports the difference in rent and in success rate, so a change to a skill or an instruction file is measured rather than felt.

## User Stories

1. As an agent user, I want to see the total context rent of one session, so that I know whether the session was expensive in absolute terms.
2. As an agent user, I want the rent broken down by carrier, so that I know which file read or tool result is charging the most.
3. As an agent user, I want to see how long each piece of content stayed in context, so that I understand why an early mistake is expensive.
4. As an agent user, I want content that was superseded to be flagged as waste, so that I stop re-reading files I am about to edit.
5. As an agent user, I want tool results that are never used again to be flagged as dead payload, so that I can stop dumping build logs and large outputs into context.
6. As an agent user, I want retry loops to be flagged with the rent they accumulated, so that I can see the real cost of a failed attempt.
7. As an agent user, I want the rent attributable to skills and MCP tools to be reported separately, so that I can judge whether a skill is worth its cost.
8. As an agent user, I want a single normalised score per session, so that I can compare two sessions of different length.
9. As an agent user, I want to scan every session I have and get totals, so that I can see my own habits across weeks of work.
10. As an agent user, I want malformed or older session files to be skipped with a reported coverage figure, so that a scan over thousands of files never fails and never lies.
11. As an agent user, I want the same report for sessions produced by a different agent, so that the tool is not tied to one vendor.
12. As an agent user, I want the tool to tell me plainly when a field is missing from a session record, so that I never mistake "unknown" for "zero".
13. As an agent user, I want a human-readable terminal report with the worst offenders first, so that I can act without opening a file.
14. As an agent user, I want a single self-contained HTML report, so that I can attach it to a message or a post and it opens offline for anyone.
15. As an agent maintainer, I want to declare a set of tasks with commands that decide success, so that comparing two configurations is reproducible.
16. As an agent maintainer, I want each task run several times, so that non-determinism does not turn into a false conclusion.
17. As an agent maintainer, I want to compare two variants and get the delta in rent and success rate, so that I can decide whether to keep a change.
18. As an agent maintainer, I want the runner to be swappable between agents, so that the same task set works on either.
19. As an agent maintainer, I want the tool to fail loudly when the task set is invalid, so that a broken declaration is not reported as a bad variant.
20. As a privacy-conscious user, I want to verify that no network connection is opened and no file outside the given paths is written, so that I can point the tool at real prompts.
21. As a contributor, I want the domain vocabulary fixed in a glossary and the load-bearing decisions recorded, so that changes do not drift from the product's meaning.
22. As a reader of the aggregate report, I want the number of sessions profiled stated next to every total, so that I can judge what the numbers are worth.

## Implementation Decisions

- **One seam.** Every behaviour is reached through the command surface: `run(argv, deps)` returns an exit code, the text to print, and the artifacts produced. The filesystem reader, the adapters and the clock are injected. Nothing calls `process.exit` and nothing touches the network or the real filesystem outside the injected reader.
- **Command surface.** `audit <path>`, `audit --all <root>`, `diff <task-set> --a <dir> --b <dir>`, with `--json` and `--html <file>` modifiers. Unknown arguments and invalid task sets exit non-zero with a single diagnostic.
- **Session model.** A session is a sequence of turns; each turn has the injections that entered the context before it. An injection carries a carrier identity, a size in tokens, and the first and last turn during which it was present. Rent is the sum over injections of size times the number of turns it survived. The rent score is the share of rent that is not waste, so that sessions of different length are comparable (ADR-0005). Content the record cannot reconstruct — the system prompt, the tool schemas, the cached prefix — is reported as a residual beside the injected total, never silently attributed and never clamped at zero.
- **Attribution by carrier.** A carrier is the file read, the tool result, the system block or the attachment that caused the injection. Carriers are identified by what they are, not by their position, so two reads of the same path are two carriers that can be compared.
- **Capability degradation.** Adapters declare which facts they can produce. When a session record lacks token usage or skill attribution, the affected metric is reported as unavailable with a coverage figure, never as zero. Every aggregate states the number of sessions behind it.
- **Waste classification.** Superseded read, dead payload and retry loop are decided from the session record alone, by rules stated in the glossary. Skill bloat requires attribution fields and is reported as unavailable without them.
- **Task set format.** Declared as JSON in v0.1: a list of tasks with an id, a prompt, and a verifier command, plus a runner and a repeat count. JSON is chosen over a YAML subset so that a broken declaration cannot be misparsed, and a shipped template is produced by `ctxrent init`.
- **Diff semantics.** Both variants run over the same task set, in a fresh working copy per run, and the report compares rent, success rate and per-task outcomes. The verifier's exit code is the only judge of success.
- **Read-only guarantee.** Session directories are opened read-only. The only writes are the artifacts the user explicitly asks for.

## Testing Decisions

- **Test only external behaviour at the seam.** No test reaches into a module's internals; every test calls the command surface and asserts on the returned text, the returned model or the produced artifact.
- **Adapters are exercised through recorded fixtures.** A small number of sanitised session fixtures, one per supported record shape, are checked in. They are derived from real records but contain no prompts, no paths and no personal data.
- **Golden outputs for the reports.** The JSON model and the HTML structure are compared against golden files, so an unexplained change in the numbers fails a test rather than reaching a reader.
- **Arithmetic invariants are asserted directly.** Rent is additive over injections; a session with one turn has rent equal to its injected tokens; removing the last turn never increases any carrier's rent.
- **The diff is tested with a fake adapter.** Runners are never executed in the test suite, so the suite stays fast, free and offline.

## Out of Scope

- Any upload, hosted leaderboard, telemetry or remote aggregation.
- Cost in currency, and any assumption about subscription plans.
- LLM-as-judge grading.
- A local web dashboard or long-running server.
- Adapters beyond the two named agents; the boundary exists but no third implementation ships.
- Windows-specific path handling beyond what a plain Node path API gives.

## Further Notes

The launch story is the aggregate: profiling a few thousand real sessions and publishing where the context goes. That makes `audit --all` a first-class command rather than a flag.
