# The reconstruction reports a residual, not full coverage

A session record stores deltas: the system prompt, the tool schemas and the cached prefix are never written to disk, so no reconstruction from the log can account for the whole measured context.

Coverage is measured **inside the last context epoch**: the injections that entered since the last compaction, over the context measured at the last turn. A drop of at least 500 tokens and 5% of the previous context is treated as a compaction; anything smaller is noise in the recorded numbers. Content before the last compaction is not counted, because the record shows it is gone — without this rule a real 932-turn Codex session reported 578M token-turns against 123M tokens spent.

The residual — `lastContext - injectedInEpoch` — is everything the reconstruction cannot account for, including content whose size could not be recovered. It is never clamped: a negative residual means the model over-attributes, which must be visible. A session whose injections are all unmeasurable reports `null`, not `0`.
