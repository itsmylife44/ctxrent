# Diff runs declared task sets

`ctxrent diff` executes variants over a declared task set with command verifiers, rather than correlating two logs that already exist. Correlating two sessions cannot separate a change in the variant from a change in the task or the environment, and agent non-determinism makes a single pair of logs meaningless. Consequence: diff spends tokens and needs a sandbox, so `audit` must stay useful on its own and carry the launch story.
