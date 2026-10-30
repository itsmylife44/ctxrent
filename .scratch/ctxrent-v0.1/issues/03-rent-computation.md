# 03: Rent computation

**What to build:** Context rent is computed in token-turns, attributed to the carrier that caused each injection, and expressed as a normalised score so that sessions of different length can be compared.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] A single-turn session has rent equal to the tokens it injected
- [ ] Rent is additive: the sum over carriers equals the session total
- [ ] Each carrier reports rent, size, and the turns it survived
- [ ] The report lists the carriers with the highest rent first
- [ ] The score is defined on a stated range and does not depend on session length alone
