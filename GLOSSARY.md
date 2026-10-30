# ctxrent

The vocabulary for measuring what a coding agent costs in context, and for comparing agent variants fairly.

## Language

**Context rent**:
The cost a piece of content keeps charging for every turn it stays in the model's context.
_Avoid_: token cost, token usage, spend, burn

**Token-turn**:
One token occupying the context for one request. The unit of context rent.
_Avoid_: token, context token

**Injection**:
The moment content enters the context: a file read, a tool result, a system block, an attachment. Rent is charged from the injection onward.
_Avoid_: append, message, insert

**Carrier**:
The injection responsible for a stretch of content that is still paying rent.
_Avoid_: source, origin

**Superseded read**:
Content that was read and then replaced before the session ended, while still paying rent.
_Avoid_: stale read, duplicate read

**Dead payload**:
A tool result that is never referenced again after it enters the context.
_Avoid_: unused output, junk

**Retry loop**:
Repeated calls caused by failure or misalignment, where each attempt pays rent on the previous one.
_Avoid_: error, rework, loop

**Skill bloat**:
Rent attributable to a skill or MCP tool that did not contribute to the outcome.
_Avoid_: skill cost, tool overhead

**Session**:
One recorded agent conversation, from the first prompt to its termination.
_Avoid_: conversation, thread, transcript

**Turn**:
One round trip inside a session: a request and the response it produced.
_Avoid_: step, message, iteration

**Variant**:
One configuration of the agent under comparison, such as a skill version, an instruction file, or a model.
_Avoid_: arm, branch, version

**Task set**:
A declaration of tasks, each carrying a command that decides whether the task succeeded.
_Avoid_: benchmark, suite, dataset

**Verifier**:
The command whose exit code decides whether one run of a task succeeded.
_Avoid_: judge, grader, evaluator

**Run**:
One execution of a variant over a task set, repeated to absorb non-determinism.
_Avoid_: attempt, trial

**Rent score**:
A normalised expression of context efficiency for a session or an aggregate, comparable across sessions of different length.
_Avoid_: rating, grade, score

**Adapter**:
The boundary that turns one agent's recorded sessions into the project's session model, and that executes a run for that agent.
_Avoid_: parser, driver, connector
