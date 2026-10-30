# 02: Turn and injection model

**What to build:** Each turn of a session is reconstructed with the content that entered the context before it, so that the report can say *who* put *how much* into context and *when*. The mastery test is that the reconstructed per-turn sizes agree with the usage figures recorded in the session.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] A session fixture reports a list of turns, each with the injections that preceded it and their sizes
- [ ] The reconstructed size of the final turn agrees with the usage recorded for it, within a stated tolerance
- [ ] Tool results, file reads, system blocks and attachments are distinguished as separate injection kinds
- [ ] Content with no recoverable size is counted as unknown, not as zero
