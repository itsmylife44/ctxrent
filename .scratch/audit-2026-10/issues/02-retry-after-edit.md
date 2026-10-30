# 02: retry-loop punishes the correct re-read after an edit

**What to build:** Read, Edit, Read again of the same path yields superseded-read **and** retry-loop (score 26 in the audit probe). Re-reading after a write is the right habit. Do not count a re-injection as a retry when the path was written between the two reads. Decide whether paged reads (`offset`/`limit`) of one file are retries; they currently are.

**Status:** needs-triage

- [ ] Read → Edit → Read yields no retry-loop claim
- [ ] A decision on paged reads, recorded in an ADR or in GLOSSARY.md
