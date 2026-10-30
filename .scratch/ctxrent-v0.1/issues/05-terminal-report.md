# 05: Terminal report

**What to build:** The default human output: the score, a bar showing the split of rent, the worst offenders, and one section per waste class. Readable in a terminal of ordinary width and stable under `--json`.

**Blocked by:** 04.

**Status:** done

- [x] Default output leads with the score and the total rent
- [x] The worst offenders appear with rent, size and turns survived
- [x] Each waste class gets a section with its accumulated rent
- [x] Output fits 80 columns and degrades cleanly when colours are unavailable

## Comments

Implemented in `src/report/text.ts`, asserted at the seam.

- Leads with rent and score, then the worst carriers with rent, size and injection count.
- One section per waste class with the accumulated rent, plus the top claims with their reason.
- Fits 80 columns, asserted line by line in a test.
- No colour: the renderer returns plain text, so the report is stable in a pipe and in a terminal.
- Aggregates list the 20 highest-rent sessions and state how many were omitted; 3,830 sessions would otherwise drown the summary.
