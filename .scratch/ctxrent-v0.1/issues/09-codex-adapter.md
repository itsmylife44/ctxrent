# 09: Codex adapter

**What to build:** Sessions recorded by the second supported agent are read into the same model, so the same command and the same report work on either. Where that record shape cannot supply a fact, the report says so instead of implying a zero.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] A Codex session fixture produces the same model as an equivalent Claude Code fixture
- [ ] Missing usage data appears as unavailable, with the affected metrics named
- [ ] Version differences and unknown record types are tolerated without a crash
- [ ] `audit --all` over a mixed root reports the coverage split per adapter
