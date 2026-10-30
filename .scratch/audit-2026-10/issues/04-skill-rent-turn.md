# 04: Skill rent may land on the wrong turn (unverified)

**What to build:** The audit's spec reviewer reports that a turn's skill attribution charges content that arrived before the skill was invoked (`src/adapters/claude-code.ts:71-76`). Not re-checked. Reproduce with a fixture first; fix only if it is red. Also: `NotebookEdit` uses `notebook_path`, so it never matches a read in `src/waste.ts`.

**Status:** needs-triage

- [ ] A fixture that reproduces it, or a comment here saying it does not
