# The reconstruction reports a residual, not full coverage

A session record stores deltas: the system prompt, the tool schemas and the cached prefix are never written to disk. No reconstruction from the log can therefore account for the whole measured context. On ten real sessions, injections explain between 33% and 97% of the final measured context (median 44%), and the remainder is dominated by the system prompt and the tool schemas.

We report `injectedTokens` alongside `residualContextTokens` and never claim full coverage. The residual is not clamped at zero: a negative residual means the reconstruction over-attributes and the model is wrong, which must be visible rather than hidden. A session whose injections are all unmeasurable reports `null`, not `0`.
