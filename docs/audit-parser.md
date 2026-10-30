# Parser audit: does ctxrent read the records correctly?

Method: a second implementation of the extraction and aggregation, written from the record format alone in Python, with no code shared with `src/adapters`. Both were run over the same archive (3,835 Claude Code session files, 877,354 records) and the results compared. Where they disagreed, the raw records were inspected until the cause was understood.

## Result: the numbers that matter agree exactly

| | Python | ctxrent | |
| --- | ---: | ---: | --- |
| sessions | 3,835 | 3,835 | same |
| turns | 132,657 | 132,657 | same |
| input tokens | 644,029 | 644,029 | same |
| cache read | 23,785,469,903 | 23,785,469,903 | same |
| cache creation | 526,954,722 | 526,954,722 | same |
| output | 63,139,357 | 63,139,357 | same |
| total | 24,376,208,011 | 24,376,208,011 | same |

Per file, on 23 sessions including random ones and the edge cases (zero turns, multiple session ids), turns and every token field matched on every file.

Two structural facts worth stating because they make the rest trustworthy:

- **No malformed JSON** in 877,354 records. Every line parsed.
- **No orphan tool results**: 144,994 `tool_result` blocks, every one resolving to a `tool_use` by id. Carrier attribution has no guessing in it.

## The bug the audit found

**13,721 `hook_success` attachments had their text in `stdout` while `content` was an empty string.** The text extractor took the first *present* field, so it stopped at the empty `content` and returned **0 tokens — a confident zero for content it had not measured**, which is precisely what the project forbids. A further 321 `queued_command` records kept their text in `prompt`, unread.

Fixed by reading `text`, `thinking`, `rendered`, `content`, `prompt`, `stdout`, `stderr`, `output` in that order, so a record with both a rendered `content` and a raw `stdout` is still counted once. On the archive this recovered 5.8M tokens of previously invisible content; rent moved from 8.20B to 8.52B token-turns. A fixture and a test pin it.

## Differences that are deliberate, not defects

- **Injections after the last assistant record are not counted.** They were never sent to a model, so they paid no rent. Verified on two files where the counts are 54 vs 53 and 11 vs 0; in the second file there is no assistant record at all, so nothing was injected.
- **One file is one session.** Eight files carry more than one `sessionId` (subagent sidechains); the file is attributed to the last id seen. Turns and tokens are unaffected, but a subagent's work is reported under its parent file.
- **The size estimator differs from the Python one by ±1 token on some files** because JavaScript counts UTF-16 units and Python counts code points. Verified on a file containing exactly one astral character: 144,023 vs 144,022 characters.

## Known limitations, with numbers

- **56,201 attachments carry no recoverable text.** They are harness state records — `deferred_tools_record` (37,634), `prompt_snapshot` (6,340), `command_permissions`, `credential_org`, `diagnostics` — not content with a size. They are reported as unmeasurable, which is honest but inflates that counter; they do not affect rent.
- **The largest injection sources are harness context, not user work.** By volume: `skill_listing` 33.2M tokens, `deferred_tools_delta` 17.0M, `instructions` 13.8M, `agent_listing_delta` 6.3M, `hook_additional_context` 4.4M. This is why an attachment is so often the top carrier.
- **`api-request` and `api-request-blob` (56,019 records) are not read.** They hold request payload deltas, which is the only route to a fuller reconstruction; ADR-0004 explains why the residual exists instead.
- **293 files have no assistant record at all** (aborted sessions). They are reported as sessions with no usage, not hidden.

## What this audit does not prove

That the waste rules are right — only that the data they run on is read faithfully. A claim can be built from correct numbers and still be a bad heuristic; `ctxrent diff` is the instrument for that question.
