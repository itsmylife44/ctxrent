# Context waste: what makes a diagnostic CLI useful, and prescriptions vs. dashboards

Research note for `ctxrent`. Every claim is tied to a primary source (vendor docs, shipped types or
source, repository issues); where I found none, it appears in **What I could not ground**.

## The answer, in one paragraph

Tools developers run repeatedly do not present "here are your numbers" — they present a **small,
ranked list of changes, each carrying a unit of saving and a threshold that can fail a build**.
Lighthouse is the clearest documented case: its report type has an `Opportunity` details kind with
per-item `wastedBytes`/`wastedMs` and audit-level `overallSavingsBytes`/`metricSavings`, while the
score deliberately excludes opportunities so the summary number and the prescriptions stay separate
surfaces. Every tool in the repeated-run set (Lighthouse CI, ESLint, size-limit) documents the same
adoption contract: a threshold, exit codes `0/1/2`, and a way to pin today's state as a baseline so
only *new* problems fail. LLM-observability products document the opposite shape: LangSmith's
Insights produces "findings with percentages" plus links to example traces, with no estimated saving,
no threshold and no exit code. The economics premise is confirmed by both vendors — Anthropic
documents that caching references "the entire prompt … `tools`, `system`, and `messages`", and OpenAI
does the arithmetic out loud: "Across ten requests, one write and nine full reads cost 2.15× …
compared with 10× without caching" — with the correction that a re-sent token is charged at the
**cached-read rate (0.1×)**, so token-turns are a sound *unit* but any money figure must use the
documented multipliers. Both vendors now ship compaction that summarises or drops earlier content, so
ctxrent's rent model needs a stop condition it states rather than assumes.

## 1. The prescription pattern in tools developers run repeatedly

- **Lighthouse types its recommendations, and the type includes the saving.** The LHR details union
  has an `Opportunity` member with `overallSavingsBytes` ("Total byte savings covered by this
  audit"), a deprecated `overallSavingsMs`, and items carrying `wastedBytes`/`wastedMs`; each audit
  result also carries `metricSavings`, "Estimates of how much this audit affects various performance
  metrics." A recommendation is a record with an amount, not prose — and it is graded for
  prescriptiveness by `Result.guidanceLevel`, "A number indicating how much guidance Lighthouse
  provides to solve the problem in this audit on a 1-3 scale. Higher means more guidance."
  [audit-details.d.ts](https://github.com/GoogleChrome/lighthouse/blob/main/types/lhr/audit-details.d.ts),
  [audit-result.d.ts](https://github.com/GoogleChrome/lighthouse/blob/main/types/lhr/audit-result.d.ts)
- **The score and the prescriptions are deliberately different surfaces.** "In general, only metrics
  contribute to your Lighthouse Performance score, not the results of Opportunities or Diagnostics. …
  In the Lighthouse report, the **Opportunities** section has detailed suggestions and documentation
  on how to implement them."
  [performance-scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring)
- **Lighthouse has an explicit "no score" vocabulary — not zero.** `scoreDisplayMode` includes
  `notApplicable` ("the audit turned out to not apply to the page"), `informative` and `error`, all
  documented as "Score is null and should be ignored."
  [audit-result.d.ts](https://github.com/GoogleChrome/lighthouse/blob/main/types/lhr/audit-result.d.ts)
- **ESLint's prescription is executable, or at least precisely located.** `--fix` fixes "as many
  issues as possible. The fixes are made to the actual files themselves and only the remaining
  unfixed issues are output", with `--fix-type` splitting `problem`, `suggestion`, `layout`,
  `directive`. The documented shape of advice is "here is the change, applied" or "here is the
  residual", never a score.
  [ESLint CLI reference](https://github.com/eslint/eslint/blob/main/docs/src/use/command-line-interface.md)
- **webpack-bundle-analyzer is the pure dashboard in this set, and its surface has no threshold, no
  exit code and no saving.** The README promises "1. Realize what's _really_ inside your bundle 2.
  Find out what modules make up the most of its size 3. Find modules that got there by mistake 4.
  Optimize it!", and the option table offers only `analyzerMode: server|static|json|disabled`, host,
  port, filename, `defaultSizes`, `excludeAssets` — no budget, no fail condition. Its *prescriptive*
  companion is a separate tool (`size-limit --why` → Statoscope), not the analyser.
  [README](https://github.com/webpack-contrib/webpack-bundle-analyzer#readme),
  [size-limit README](https://github.com/ai/size-limit#readme)
- **OpenTelemetry contributes naming, not advice.** "The benefit of using Semantic conventions is in
  following a common naming scheme that can be standardized across a codebase, libraries, and
  platforms." Concretely, `gen_ai.usage.cache_read.input_tokens` ("The number of input tokens served
  from a provider-managed cache") and `gen_ai.usage.cache_creation.input_tokens` exist, both "SHOULD
  be included in `gen_ai.usage.input_tokens`" — exactly the cache-split accounting ctxrent
  reconstructs from logs.
  [Semantic Conventions](https://opentelemetry.io/docs/concepts/semantic-conventions/),
  [GenAI registry](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/)
- **An LLM-observability "insights" feature documents findings without savings.** LangSmith Insights
  "automatically analyzes your traces to detect usage patterns, common agent behaviors, and failure
  modes" and "uses hierarchical categorization … to highlight actionable trends", but the documented
  result is "Key findings with percentages showing how often each pattern appears" plus "Clickable
  references (e.g., #1, #2, #3) to traces". No saving, no threshold, no exit code; each run also
  costs money ("over 1,000 threads typically costs $1.00-$2.00 with OpenAI models").
  [docs.langchain.com/langsmith/insights](https://docs.langchain.com/langsmith/insights)

## 2. Adoption mechanics: what makes a diagnostic run repeatedly

- **"Baseline + compare + non-zero exit" is documented end to end in Lighthouse CI's assertion
  code.** Assertions compare `expected` vs `found` with per-type operators (`minScore` `>=`,
  `maxLength`/`maxNumericValue` `<=`), default to `minScore 0.9` when the user configures nothing,
  print failures only (`results.filter(result => !result.passed)`), and end with `Assertion failed.
  Exiting with status code 1.`
  [cli/src/assert/assert.js](https://github.com/GoogleChrome/lighthouse-ci/blob/main/packages/cli/src/assert/assert.js),
  [utils/src/assertions.js](https://github.com/GoogleChrome/lighthouse-ci/blob/main/packages/utils/src/assertions.js)
- **Missing data fails rather than silently passing.** With no numeric result, LHCI records `actual:
  NaN, passed: false` and the message "Audit did not produce a value at all."
  [utils/src/assertions.js](https://github.com/GoogleChrome/lighthouse-ci/blob/main/packages/utils/src/assertions.js)
- **ESLint documents a three-code exit contract around a warning threshold.** `--max-warnings Int —
  Number of warnings to trigger nonzero exit code - default: -1`; the table reads "`0`: … If the
  `--max-warnings` flag is set to `n`, the number of linting warnings is at most `n`. `1`: … there
  are more linting warnings than allowed by the `--max-warnings` option. `2`: Linting was
  unsuccessful due to a configuration problem or an internal error."
  [ESLint CLI reference](https://github.com/eslint/eslint/blob/main/docs/src/use/command-line-interface.md)
- **ESLint ships a baseline as a checkable artifact, and the maintainers explain why.** `--suppress-all`
  "Suppresses existing violations, so that they are not being reported in subsequent runs. It allows
  you to enable one or more lint rules and be notified only when new violations show up." The
  announcement states the intent as three steps: "1. Record existing violations in a separate file
  that can be checked in to source control. 2. Enable the rule as an error. This will now only apply
  to new code. 3. Address existing violations … at your own pace."
  [CLI reference](https://github.com/eslint/eslint/blob/main/docs/src/use/command-line-interface.md),
  [Introducing bulk suppressions](https://eslint.org/blog/2025/04/introducing-bulk-suppressions/)
- **size-limit documents the "derive the threshold from the first measurement" workflow.** "Size
  Limit is a performance budget tool for JavaScript. It checks every commit on CI, calculates the
  real cost of your JS for end-users and throws an error if the cost exceeds the limit." Its setup is
  a sequence: run once, then "let's set the limit. Add 25% to the current total size and use that as
  the limit", then "Add the `size` script to your test suite".
  [size-limit README](https://github.com/ai/size-limit#readme)
- **The stated reason to move a diagnostic into CI is that CI already runs repeatedly.** Lighthouse
  CI quotes Fowler — "each integration is verified by an automated build (including tests) to detect
  integration errors as quickly as possible" — and concludes "Lighthouse CI helps make Lighthouse a
  part of the automated testing process."
  [introduction-to-ci.md](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/introduction-to-ci.md)
- **Zero-configuration is an argued position in tools that won.** Prettier's maintainers: "Prettier
  has a few options because of history. **But we won't add more of them.** … By far the biggest
  reason for adopting Prettier is to stop all the ongoing debates over styles", because otherwise
  "[t]he debates over styles just turn into debates over which Prettier options to use."
  [option-philosophy](https://prettier.io/docs/option-philosophy)
- **A live instance of a diagnostic refusing to prescribe, with a stated actionability bar.** An
  automated weekly CI-runtime report filed in the Langfuse repo compares against a named baseline,
  applies an explicit rule ("Nothing regressed ≥10% on a median against baseline … the 3+ consecutive
  days the intra-week rule requires"), and concludes "**No suggested diff is included in this
  report**" with four numbered reasons, one being that its strongest candidate "could not be
  verified". A bot artifact, not documentation — but a concrete threshold → verdict →
  non-prescription example.
  [langfuse/langfuse#16233](https://github.com/langfuse/langfuse/issues/16233)

## 3. The economics the tool claims

- **Confirmed: the whole prompt prefix is re-sent and re-read on every request.** Anthropic:
  "**Prompt caching caches the full prefix** — Prompt caching references the entire prompt: `tools`,
  `system`, and `messages` (in that order), up to and including the block designated with
  `cache_control`." OpenAI: caching "preserves that state for a reusable **prefix** … the model can
  reuse the saved state instead of processing those tokens again. It still needs to process any new
  input."
  [Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-caching),
  [OpenAI](https://platform.openai.com/docs/guides/prompt-caching)
- **Confirmed: cost scales as content size × number of subsequent requests.** Anthropic's identity is
  `total_input_tokens = cache_read_input_tokens + cache_creation_input_tokens + input_tokens`, and
  its worked example re-reads 100,000 cached tokens plus 50 new ones per request ("Total input tokens
  processed: 100,050"). OpenAI states the law directly: "At the 0.1× read rate with 30-minute writes,
  writing a prefix once and fully reusing it once costs 1.35× its ordinary input cost, compared with
  2× for processing it twice without caching. **Across ten requests, one write and nine full reads
  cost 2.15× at that rate, compared with 10× without caching.**"
  [Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-caching),
  [OpenAI](https://platform.openai.com/docs/guides/prompt-caching)
- **Correction to the naive model: a re-read token is billed at 0.1× base, a write at 1.25×–2×.**
  Anthropic: "Cache write tokens with a 5-minute TTL are 1.25 times the base input tokens price …
  Cache read tokens are 0.1 times the base input tokens price." OpenAI: reads "0.1×", writes "1.25×
  the standard, uncached input-token rate for the default 30-minute lifetime" (2.5× for 12 hours).
  Token-turns stay correct as a *volume* unit; a dollar figure must apply these multipliers or it
  overstates rent by roughly 10×.
  [Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-caching),
  [OpenAI](https://platform.openai.com/docs/guides/prompt-caching)
- **Confirmed and named: both vendors ship compaction that drops or replaces content.** Anthropic:
  "Compaction replaces the older turns of a conversation with a summary that Claude writes on the
  server"; in threshold compaction "the API drops what came before the block", and for by-rule
  removal "To clear old tool results or old thinking blocks by rule instead of summarizing them, see
  Context editing." OpenAI lists `context_management` (Compaction) as "Replaces earlier conversation
  content with a compacted context that can prevent reuse from the first changed token onward", and
  warns "Summarization, compaction, or context truncation can change the prefix and reset cache
  reuse."
  [Anthropic compaction](https://platform.claude.com/docs/en/build-with-claude/compaction),
  [OpenAI](https://platform.openai.com/docs/guides/prompt-caching)
- **A cache-invalidating edit is itself an economic event.** Anthropic's invalidation table:
  "Modifying tool definitions (names, descriptions, parameters) invalidates the entire cache", and
  "Changes at each level invalidate that level and all subsequent levels." A superseded read is not
  only rent — if it moves the cached prefix, it also charges a write.
  [Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

## 4. What users actually ask for

- **Users ask to slice the number, not to be told what to change.** Langfuse: "we cannot create
  dashboards that show metrics like: Requests per **organization**, Latency per **organization**,
  Token usage per **organization**", requested as "Allow selecting metadata keys such as
  `metadata.organizationId` as a **breakdown dimension**."
  [langfuse/langfuse#12614](https://github.com/langfuse/langfuse/issues/12614)
- **Users ask for aggregation of usage that exists but is buried.** promptfoo: "Wondering if we can
  add more informative Token Usage/Latency Summary as part of the UI. Currently, we can only see the
  token usage/ latency by hovering on the each row."
  [promptfoo/promptfoo#251](https://github.com/promptfoo/promptfoo/issues/251)
- **The maintainer framing of "insights" is a question plus drill-down, not a saving.** Phoenix
  roadmap #756, "Insights to Finetune Your LLMs/Prompt Engineering": "What responses are getting bad
  scores? Where should you fine tune for better responses?" — the implied deliverable is a route to
  the offending traces.
  [Arize-ai/phoenix#756](https://github.com/Arize-ai/phoenix/issues/756)
- I did **not** find, in the issues I could retrieve from these three trackers, a user literally
  asking for "a recommendation with an estimated saving" or "tell me what to change to reduce
  tokens": the retrievable demand is for *dimensions*, *aggregates* and *drill-down*. That is a
  negative result from a narrow search (see below), not evidence of absence.

## Implications for ctxrent

1. **Every waste claim must carry a `saving` in token-turns, because that is the documented shape of
   a recommendation** (Lighthouse `wastedBytes`/`wastedMs`, `overallSavingsBytes`, `metricSavings`).
   Test: each claim in `--json` has a non-null `savingTokenTurns`, and the claims sum to `waste`.
2. **Keep the score and the prescription list as separate surfaces, as Lighthouse does.** The score
   is the summary (ADR 0005's non-waste share); prescriptions are ranked by saving, not claim count.
   Test: `rentScore` is invariant to how many claims are emitted, and one large `retry-loop` outranks
   fifty tiny `dead-payload` claims.
3. **Ship a gate on the documented three-code contract.** `ctxrent check --max-waste <pct>` exits `0`
   (under), `1` (over), `2` (cannot measure: unreadable record, coverage below a floor), mirroring
   ESLint's table and LHCI's `Exiting with status code 1.` Test: three fixtures produce exactly
   0/1/2, and `--json` reports `expected`, `actual`, `operator`, `passed` in the LHCI shape.
4. **Missing data must fail the gate, never pass it.** LHCI sets `actual: NaN, passed: false` ("Audit
   did not produce a value at all"); Lighthouse marks such audits `notApplicable` with a score that
   "should be ignored". The README's unavailable-not-zero promise must reach the exit code. Test: an
   all-unmeasurable Codex session exits 2, not 0.
5. **Provide a written baseline so only new waste fails**, following ESLint suppressions and
   size-limit's "current size + 25%". `ctxrent baseline` records measured per-carrier rent;
   `ctxrent check --baseline` compares within a stated tolerance. Test: an identical rerun is a no-op;
   one new 5k token-turn carrier fails and is named.
6. **If a money column is ever added it must use the documented multipliers** — reads `0.1×`, 5m
   writes `1.25×`, 1h writes `2×` (Anthropic); OpenAI's own example reduces ten requests from `10×`
   to `2.15×`. ADR 0001's refusal to price in money remains correct until those are cited in output.
   Test: a unit test converts a known token-turn total to the discounted figure and the report states
   the multipliers used.
7. **State the compaction boundary where rent is reported.** Anthropic's compaction "replaces the
   older turns … with a summary"; OpenAI's "replaces earlier conversation content". ctxrent's
   500-token / 5% rule is its own heuristic and should be labelled as such beside the vendor
   mechanisms it approximates. Test: the report footnote names compaction and links the vendor docs.
8. **Emit the OpenTelemetry GenAI names for the token split in `--json`**
   (`gen_ai.usage.cache_read.input_tokens`, `cache_creation.input_tokens`, `input_tokens`) so
   ctxrent's numbers compose with LLM-observability stacks instead of inventing a parallel
   vocabulary. Test: `--json` validates against those three keys.
9. **Default to zero flags.** `ctxrent audit` with no arguments should already find
   `~/.claude/projects` and `~/.codex/sessions`; Prettier's option philosophy is the argument that a
   tool requiring configuration before its first useful output debates itself out of adoption. Test:
   a bare `ctxrent audit` prints a report.

## What I could not ground

- **That prescription-shaped output *causes* higher repeat usage than dashboards.** No controlled
  study and no maintainer statement of a measured adoption effect. The evidence above documents *what
  successful tools ship*, not causality — any such claim is inference.
- **A vendor-documented "recommendations with estimated savings" feature in an LLM-observability
  product.** LangSmith Insights is documented but its findings carry frequencies and trace links, not
  savings; I did not verify Braintrust's equivalent and found no Langfuse or Phoenix documentation of
  a recommendations feature.
- **A user issue literally asking "how do I reduce tokens" / "tell me what to change".** The GitHub
  searches I ran (`is:issue`, title/body matches, unauthenticated search API) returned dimension and
  aggregate requests instead. Narrow, rate-limited and non-exhaustive: GitHub Discussions and issue
  *comments* were not searched.
- **The magnitude of the compaction discount.** Neither vendor documents what fraction of tokens a
  summary retains, so ctxrent can only claim that compaction removes some rent, not how much.
- **Per-turn cached-token accounting as written by Claude Code and Codex session logs.** Neither is
  publicly documented at that level — which is why ADR 0004 reports a residual; I found no primary
  source describing how those records encode cache reads and writes.
- **Whether Lighthouse labels its savings "estimates" in user-facing copy.** The type only says
  "Total byte savings covered by this audit"; the word "Estimates" appears on `metricSavings`. I cite
  the type definitions, not the report copy.
