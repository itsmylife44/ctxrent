# ctxrent

Your coding agent pays rent on every token it keeps in context. `ctxrent` measures that rent, shows where it goes, and tells you which of it was waste.

Local-only. No network, no telemetry, no runtime dependencies. It reads the session records your agent already writes and never sends them anywhere.

## The idea

A file read at turn 2 of a 200-turn session is re-sent to the model on turn 3, 4, 5… until the context is compacted. It does not cost its size; it costs `size x turns survived`. That is **context rent**, measured in **token-turns**. It is why an early mistake is expensive and a late one is not, and no token counter shows it.

## Usage

```bash
npx ctxrent                                    # the session you just finished
npx ctxrent audit ~/.claude/projects/-Users-you-code-my-app
npx ctxrent audit <session.jsonl> --json
npx ctxrent audit <session.jsonl> --html report.html
npx ctxrent audit ~/.claude/projects --all
npx ctxrent check --max-waste 40               # gate: 0 ok, 1 over, 2 cannot measure
npx ctxrent teach                              # what to write down, from every session
npx ctxrent teach --write ~/.claude/CLAUDE.md  # preview, then ask before writing
```

Supported records: Claude Code (`~/.claude/projects`) and Codex (`~/.codex/sessions`). The adapter is detected from the file itself.

```
session be2743a9-…
232 turns · 52,794,243 tokens spent · 45% of context accounted for

rent 12,653,567 token-turns   score 56/100

top carriers
  attachment                        8,069,611 rent   51,617 tok 346×
  Bash                              2,570,530 rent   30,060 tok 106×

waste 8,977,870 token-turns (45% of rent)
  retry-loop         8,515,980   427 claim(s)
```

## What to change

Every report ends with the two or three changes that would have saved the most, each with an amount and a line you can paste into `AGENTS.md`:

```
what to change
  1. 1,125,365 token-turns · 34 claim(s)
     Move fixed context into a file the agent reads on demand, not an always-on…
     e.g. attachment · 38,546 tokens × 34
  2. 180,209 token-turns · 4 claim(s)
     Cap what a command prints: pipe it through head, or write it to a file and…
```

Advice is written as an instruction because you cannot stop an agent from running `cat` — you can only steer it. Then measure the effect with `ctxrent diff`.

## What counts as waste

| Class | Rule | What it catches |
| --- | --- | --- |
| `superseded-read` | A file read, then rewritten later in the session | Reading a file you were about to edit |
| `dead-payload` | A tool result over 500 tokens from a carrier never used again, with at least 2 turns left | Build logs and dumps that sit in context forever |
| `retry-loop` | The same carrier injected again within 2 turns | Failed calls and correction cycles |
| `duplicate-context` | The same attachment text injected again in one context epoch | Context that is already there, paid twice |

Every claim names the carrier and the turns that justify it. Rules that cannot be decided from the record are reported as unavailable, never as zero.

## Teaching the agent, not just reporting

`ctxrent teach` aggregates every session into rules with evidence, then writes only the ones that recurred. A rule that appeared once is an afternoon, not a habit.

```
  attachment-bloat      configuration  3,533 claims ·  3533 sessions · 3,138,375,885 token-turns
  read-via-read-tool    instruction   10,897 claims ·  2300 sessions · 1,093,155,287 token-turns
```

It writes a **managed block**, delimited by `<!-- ctxrent:begin -->`, so re-running it replaces its own rules and leaves your text alone.

Nothing is ever written without consent. `teach` is a dry run by default; with `--write` it prints the target, what will change, the full block, how the change will be verified and how to undo it, and then asks. Without a terminal to answer — a script, CI, a pipe — it refuses and exits non-zero unless `--yes` is passed. That flag is the explicit statement that you chose this.

The output separates two levers, because conflating them produces advice that cannot work:

- **instruction** — a line for `CLAUDE.md` / `AGENTS.md`, because the agent can choose differently.
- **configuration** — the record is dominated by something the agent does not control, such as an always-on attachment from a hook. Telling the agent about it does nothing; the fix is to turn the hook off or trim the skill listing.

Then close the loop: apply the block, keep working, and run `ctxrent check` again. If waste does not fall, remove the rule — otherwise you have made a guess global.

## Comparing variants

`ctxrent diff` runs two variants over the same declared task set and reports the delta in rent and in success rate, so a change to a skill or an instruction file is measured rather than felt. Aggregate reports list the highest-rent sessions and state how many were omitted: the top 20 in the terminal, the top 100 in the HTML.

```bash
npx ctxrent init            # writes ctxrent.json
npx ctxrent diff ctxrent.json --a before/ --b after/
```

```json
{
  "runner": "claude",
  "repeat": 3,
  "tasks": [{ "id": "fix-typo", "prompt": "…", "verify": "npm test" }]
}
```

The verifier's exit code is the only judge of success. Each run happens in a fresh copy of the variant directory and is cleaned up afterwards. **The verifier is a shell command from your own task set and runs with your permissions** — it is not sandboxed.

## Honesty about the numbers

- **Token-turns are a volume unit, not a money unit.** A re-read token is billed at 0.1× the base input rate and a cache write at 1.25×–2× (Anthropic and OpenAI prompt-caching docs), so rent tells you what dominates the prompt, not what the prompt cost. `ctxrent` deliberately reports no currency.
- Injection sizes are **estimated** at `ceil(chars / 4)` from the recovered text. The model labels them `estimated`, and content whose text cannot be recovered is `unknown`, not zero.
- The record stores deltas: the system prompt, the tool schemas and the cached prefix are never written to disk. Their rent is reported as `residualContextTokens`, never silently attributed. Coverage is measured inside the last context epoch, so the report always states the share it can explain.
- When the context is compacted, content the record shows as dropped stops paying rent. Without that rule a long session reports more rent than it spent in tokens. A drop of at least 500 tokens and 5% counts as a compaction; smaller dips are treated as noise.
- Rules never guess: a class that cannot be decided from the record produces no claim. A session with nothing measurable reports rent and waste as unavailable rather than zero, and a record that names nothing a rule can judge — Codex tool outputs carry only a bare tool name — reports waste and score as unavailable rather than a perfect 100.
- Codex `input_tokens` already includes cached tokens, so its totals are not directly comparable with Claude Code's cache-split totals.

## Development

```bash
node --test test/*.test.ts      # 88 tests, no network, no real agents
npx tsc --noEmit                # typecheck
```

Requires Node >= 22.18 (TypeScript source is run directly).

## Design

The vocabulary lives in [`GLOSSARY.md`](./GLOSSARY.md) and the load-bearing decisions in [`docs/adr/`](./docs/adr/). Everything in the tool is reached through one seam, `run(argv, deps)`, with the filesystem and the agent runner injected.

MIT licensed.
