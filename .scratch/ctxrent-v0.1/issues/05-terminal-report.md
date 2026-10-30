# 05: Terminal report

**What to build:** The default human output: the score, a bar showing the split of rent, the worst offenders, and one section per waste class. Readable in a terminal of ordinary width and stable under `--json`.

**Blocked by:** 04.

**Status:** ready-for-agent

- [ ] Default output leads with the score and the total rent
- [ ] The worst offenders appear with rent, size and turns survived
- [ ] Each waste class gets a section with its accumulated rent
- [ ] Output fits 80 columns and degrades cleanly when colours are unavailable
