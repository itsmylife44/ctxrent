# 09: Codex adapter

**What to build:** Sessions recorded by the second supported agent are read into the same model, so the same command and the same report work on either. Where that record shape cannot supply a fact, the report says so instead of implying a zero.

**Blocked by:** 02.

**Status:** done

- [x] A Codex session fixture produces the same model as an equivalent Claude Code fixture
- [x] Missing usage data appears as unavailable, with the affected metrics named
- [x] Version differences and unknown record types are tolerated without a crash
- [x] `audit --all` over a mixed root reports the coverage split per adapter

## Comments

Implemented in `src/adapters/codex.ts` with automatic detection in `src/adapters/index.ts`: a log opening with `session_meta` or `turn_context` is Codex, one opening with `assistant` or `user` is Claude Code.

- A turn is a `token_count` event, which carries `last_token_usage` for that request.
- User and developer messages become injections; `function_call_output` and `custom_tool_call_output` become tool results, with the carrier resolved through `call_id`.
- `input_tokens` already includes cached tokens for Codex, so `total` is `input + output` and the cached figure is reported separately. The two adapters' totals are not directly comparable, and the README says so.
- Attribution is absent from Codex records and is reported as unavailable.
- A Codex session without token counts reports zero turns and unavailable usage, not zero tokens.
