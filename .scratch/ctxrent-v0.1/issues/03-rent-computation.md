# 03: Rent computation

**What to build:** Context rent is computed in token-turns, attributed to the carrier that caused each injection, and expressed as a normalised score so that sessions of different length can be compared.

**Blocked by:** 02.

**Status:** done

- [x] A single-turn session has rent equal to the tokens it injected
- [x] Rent is additive: the sum over carriers equals the session total
- [x] Each carrier reports rent, size, and the turns it survived
- [x] The report lists the carriers with the highest rent first
- [x] The score is defined on a stated range and does not depend on session length alone

## Comments

Implemented with TDD, 57 tests in the suite, typecheck clean.

- Rent is `size x turns survived`, charged per injection and aggregated per carrier.
- The score was first defined as efficiency (`injected / rent`). Real data killed it: a 232-turn session scored 1/100 and a 7-turn session 77, so it ranked session length rather than behaviour. It is now the non-waste share, `100 x (1 - wasteRent / rent)`, recorded in ADR-0005. Rent in absolute token-turns is always shown beside it.
- Lifespan is bounded by the context epoch: when the record shows the context shrinking, the dropped content stops paying. Without this a real 932-turn Codex session reported 578M token-turns against 123M tokens spent, which is arithmetically impossible.
- Real data: one session reports 12,653,567 token-turns over 52,794,243 tokens spent.
