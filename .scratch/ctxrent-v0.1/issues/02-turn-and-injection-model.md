# 02: Turn and injection model

**What to build:** Each turn of a session is reconstructed with the content that entered the context before it, so that the report can say *who* put *how much* into context and *when*. The mastery test is that the reconstructed per-turn sizes agree with the usage figures recorded in the session.

**Blocked by:** 01.

**Status:** done

- [x] A session fixture reports a list of turns, each with the injections that preceded it and their sizes
- [x] The share of the measured context the reconstruction accounts for is reported per session, and the remainder is named (criterion renegotiated, see Comments and ADR-0004)
- [x] Tool results, file reads, system blocks and attachments are distinguished as separate injection kinds
- [x] Content with no recoverable size is counted as unknown, not as zero

## Comments

Implemented with TDD at the agreed seam, 17 tests, typecheck clean.

**Criterion 2 was renegotiated, not quietly reinterpreted.** The original wording asked for the reconstruction to agree with recorded usage within a tolerance. That is unreachable by construction: the session record stores deltas and never contains the system prompt, the tool schemas or the cached prefix. Measurement over ten real sessions shows injections explaining 33% to 97% of the final measured context, median 44%. The criterion is therefore replaced by: the accounted share and the residual are reported, and the tool never claims full coverage. Recorded in ADR-0004.

Findings that shaped the implementation:

- The residual is not clamped at zero. A negative residual means the model over-attributes, and hiding that behind `Math.max(0, …)` would make the worst failure look like a clean report.
- Totals are derived from injections that belong to a completed turn. Content that arrives after the last recorded turn is in the context but belongs to no turn, and counting it would compare a cumulative estimate against one turn's measurement.
- A session whose injections are all unmeasurable reports `injectedTokens: null`, not `0`, matching the existing `tokens: null` convention.
- Attachment text often lives in `content`, not `rendered`; without that the parser produced 141 false "unknown" injections on a real session. Coverage on that session moved from 44% to 73% and unknowns from 164 to 40, the rest being genuine (image reads, tool references).
- `charsOf` prefers the first non-empty string field, so an empty `text` beside a populated `content` cannot produce a fabricated zero.
