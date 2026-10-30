# What 3,832 real sessions say about prescriptions

Empirical companion to `context-waste-prescriptions.md`. Method: `ctxrent audit ~/.claude/projects --all --json` over the local archive (3,832 sessions, 132,577 turns, 24.36B tokens spent), then aggregation of the waste claims by carrier template.

## The headline numbers

- **93% of sessions end with waste still live in the context** (3,287 of 3,540 non-empty sessions). Waste is not only historical: it is still being re-sent when the session stops.
- Live waste totals **2.68B token-turns**, and 95% of it is `dead-payload` — large tool output that was never used again.
- The concentration is extreme: **the top 5 carrier templates account for 71% of live waste, the top 10 for 84%**. A short list can cover most of the problem, which is what makes prescriptions viable.

## The top templates, and why the label matters

| template | share of live waste |
| --- | --- |
| `Bash cd …` | 20.9% |
| `Bash cat …` | 20.1% |
| `Bash sed …` | 18.7% |
| `Bash grep …` | 6.7% |
| `Bash gh …` | 5.1% |
| `Bash git …` | 4.6% |

**`Bash cd` is a mislabel and a warning.** A bare `cd` produces no output, so it cannot hold 561M token-turns. Inspecting the carriers shows commands like `cd ~/.claude/scripts && cat statusline.config.json && cat src/index.ts && ls -R …`: the first token is `cd`, the *content* comes from the rest of the pipeline. Any prescription derived from the first token would be wrong. Prescriptions must be derived from the command's shape, and the grouping above is only a coarse index.

## The real, dominant habit

Reading files through Bash instead of the Read tool. Sampled carriers:

```
Bash cat docs/adr/0006*.md docs/adr/0007*.md              924 tok median, 3,857 p90
Bash sed -n '1,400p' docs/spec-v1-aderenza.md             708 tok median, 2,308 p90
Bash git diff master...HEAD -- app/ | sed -n '1,700p'     285 tok median, 3,080 p90
Bash gh issue view 13 --comments | tail -60               399,301 token-turns in one claim
```

The median is modest (200–900 tokens) but the tail is not, and the rent is per claim, not per session. One `gh issue view --comments` cost 399k token-turns because the session continued for a hundred more turns.

## Why the prescription is an instruction, not a manual action

The user cannot stop an agent from running `cat`. The lever is the agent's own instructions. So every prescription must be expressible as a line for `AGENTS.md` / `CLAUDE.md`, and the effect of adding it is measurable with `ctxrent diff` on a declared task set. That closes the loop: measure → prescribe → edit instructions → measure again.

## What this analysis cannot tell us

- Whether removing the content would have kept the task successful. The saving is an upper bound on volume, not a proven improvement in outcome. That is exactly what `diff` exists to test.
- How much of the re-sent volume was billed as a cache read (0.1×) rather than a fresh write. Token-turns are a volume unit; the research note explains why a money figure would need the documented multipliers.
- Whether the agent needed that output later in a way the record does not show. The dead-payload rule is conservative (never reused, at least two turns left) but it is still a heuristic.

## Addendum: the blind spot this analysis found

Attachments are **38.6% of live rent** across the archive — the second largest carrier after tool results — and no waste rule touched them, because nothing about an always-on attachment "stopped being useful": it was never not useful. A session can therefore show `score 100/100` on 90k token-turns of rent concentrated in one attachment, which is a false reassurance.

Two fixes follow, and both are implemented:

- `duplicate-context`: identical attachment text injected again inside one context epoch is pure duplication, identified by a content hash. Deterministic, no heuristic.
- Carrier-driven prescriptions: a carrier holding a large always-on attachment produces advice with an amount even when it produces no waste claim. This is the same separation Lighthouse documents between its score and its opportunities.
