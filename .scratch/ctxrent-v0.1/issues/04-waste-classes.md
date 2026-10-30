# 04: Waste classes

**What to build:** Superseded read, dead payload and retry loop are recognised from the session record and reported with the rent each one accumulated, so that the report points at habits rather than at raw sizes.

**Blocked by:** 03.

**Status:** done

- [x] A fixture containing each of the three classes surfaces each one with attributed rent
- [x] A clean fixture produces no waste claims
- [x] Every claim names the carrier and the turns that justify it
- [x] A class that cannot be decided from the record is reported as unavailable rather than empty

## Comments

Implemented as three deterministic rules in `src/waste.ts`, each producing a claim that names the carrier, the turns and the rent.

- `superseded-read`: a file read followed by a write to the same path, paying rent from the write onward.
- `dead-payload`: a tool result of at least 500 tokens whose carrier is never used again, with at least 2 turns of rent left.
- `retry-loop`: the same carrier injected again within 2 turns.
- Waste stops at the context epoch boundary, like rent.
- A claim is never asserted twice for the same injection, and a clean fixture produces no claims.
- Rules that cannot be decided from the record are the ones not implemented; the report says nothing rather than guessing.

Review addendum: the first implementation fired `retry-loop` on any repeated carrier, so two ordinary user messages counted as a retry. Carriers now identify the call (`Bash npm test` is not `Bash git status`), retry applies only to tool results and file reads, and a carrier with no detail is never called a retry. Waste and score are reported as unavailable when the record names nothing a rule can judge — Codex tool outputs carry a bare tool name, and reporting 100/100 there would have been a lie.
