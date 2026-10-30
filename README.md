# ctxrent

Your coding agent pays rent on every token it keeps in context. `ctxrent` measures that rent, shows what caused it, and turns the worst habits into rules your agent reads before it starts.

It runs on your machine. No outbound network, no telemetry, no runtime dependencies, no install step.

## The idea

A file you read at turn 2 of a 200-turn session is sent to the model again on turn 3, turn 4, and so on until the context is compacted. It does not cost its size. It costs its size multiplied by the turns it survived:

```
rent = size x turns survived        measured in token-turns
```

That single equation explains why an early mistake costs many times a late one, why a 30k-token attachment is worse than a 30k-token file you open once, and why "you used 52M tokens" is a number you cannot act on. No token counter shows it.

## Quick start

```bash
git clone https://github.com/<you>/ctxrent
cd ctxrent
./src/cli.ts              # the session you just finished, then the page you apply from
```

To run it from the clone you need nothing but Node 22.18 or newer: the TypeScript source runs directly.

```bash
node src/cli.ts --help
```

To put the command on your PATH, build the package once and install it globally:

```bash
npm install
npm run build
npm install -g .
ctxrent --help
```

The build is an explicit step, not a lifecycle hook: npm 11 blocks package scripts by default and a `prepare` hook would be skipped anyway. The published package ships the compiled output, so the build is only needed for a local clone.

The same three commands work on Windows PowerShell; there are no symlinks and no `sh` involved.

Windows records live in `%USERPROFILE%\.claude\projects` and `%USERPROFILE%\.codex\sessions`. The compiled package runs on Node 20 or newer; developing from source needs 22.18, because the tests import the TypeScript directly. Where `ctxrent diff` runs a command, it uses `cmd.exe` on Windows and `sh` everywhere else.

## What it looks like

Real output from the test fixture in `test/fixtures/`, with some lines trimmed for length:

```
session fixture-waste
7 turns · 28,070 tokens spent · 23% of context accounted for

rent 5,850 token-turns   score 56/100

what to change
  1. 1,800 token-turns · 1 claim(s)
     Cap what a command prints: pipe it through head, or write it to a file and…
     e.g. Grep x
  2. 500 token-turns · 1 claim(s)
     Read a file after editing it, or read only the section you are about to ch…
     e.g. Read src/x.ts

top carriers
  Grep x                             2,400 rent     600 tok        t4–4
  Bash ls                            2,100 rent     800 tok     t5–6 ×2
  user                                 700 rent     100 tok        t1–1

waste 2,600 token-turns (44% of rent)
  superseded-read          500   1 claim(s)
  dead-payload           1,800   1 claim(s)
  retry-loop               300   1 claim(s)
```

In a terminal, `ctxrent` on its own prints the text report and then opens the **review page**: served only on loopback, it shows the rules already in your file first, then the new ones, each with its evidence, and applies only what stays ticked. That is the whole flow — no file path, no second command, and nothing removed unless you untick it.

`--html` writes the static report instead, for sharing and for keeping:

```bash
ctxrent --html                  # a temporary file, opened
ctxrent --html report.html      # a file you keep, opened
ctxrent --html --no-open        # just write it
```

The static report is one self-contained file — light and dark, no external references, no scripting — and opens it in your browser when a terminal is attached. In a pipe or a CI job it writes the file and prints the path instead, because opening a browser there would be wrong; `--no-open` forces that behaviour everywhere.

## What it finds

| Class | Rule | The habit it catches |
| --- | --- | --- |
| `superseded-read` | A file read, then rewritten later in the session | Reading a file you were about to edit |
| `dead-payload` | A tool result over 500 tokens from a carrier never used again, with at least two turns left | Build logs and dumps that sit in context forever |
| `retry-loop` | The same carrier injected again within two turns | Failed calls and correction cycles |
| `duplicate-context` | The same attachment text injected again in one context epoch | Context that is already there, paid twice |

A claim always names the carrier and the turns that justify it. A class that cannot be decided from the record produces no claim, and a session with nothing measurable reports rent and waste as unavailable rather than zero.

## What to change

Every report ends with the two or three changes that would have saved the most. Each carries an amount and a line you can paste into `AGENTS.md`, because you cannot stop an agent from running `cat` — you can only steer it.

A change that comes from always-on context — an attachment re-injected every turn — is labelled as such, because it is not waste: nothing stopped being useful, the content simply never stops being sent. That is also why such a session can score 100/100 while its largest cost is still worth fixing: the score measures waste, the recommendation measures rent.

## Teach the agent

`ctxrent teach` aggregates every session into rules with evidence and keeps only the ones that recur. A rule that appeared once is an afternoon, not a habit.

```
4,029 sessions · 163,968 turns analysed · 10 rules with evidence

rules
  attachment-bloat      configuration  3,533 claims ·  3533 sessions · 3,138,375,885 token-turns
  read-via-read-tool    instruction   10,897 claims ·  2300 sessions · 1,093,155,287 token-turns
  cap-command-output    instruction   14,654 claims ·  2470 sessions · 1,077,805,681 token-turns
```

It separates two levers, because conflating them produces advice that cannot work:

- **instruction** — the agent can choose differently, so a line in `CLAUDE.md` / `AGENTS.md` changes the behaviour.
- **configuration** — the record is dominated by something the agent does not control, such as an always-on attachment from a hook. Telling the agent about it does nothing; the fix is to turn the hook off.

### Nothing is written without consent

```bash
ctxrent teach                                  # dry run: prints the block, writes nothing
ctxrent teach --write ~/.claude/CLAUDE.md      # prints the target, the change, how to undo it, then asks
```

Without a terminal to answer, or if you say no, nothing happens and it exits non-zero, so a pipeline cannot mistake a refusal for success. `--yes` is the explicit statement that you chose — it exists for scripted use only.

The block is delimited by `<!-- ctxrent:begin -->` and `<!-- ctxrent:end -->`, so re-running replaces only its own block and leaves your own text alone. Within the block, an update **composes** with what is there: a rule you approved earlier stays even if it no longer recurs today, and the review page shows the current rules first, so removing one is a deliberate untick rather than an accident. To undo everything, delete what is between the markers.

### Or decide in the browser

```bash
ctxrent review
```

Opens a page served only on `127.0.0.1`, with a real form: each rule is a checkbox showing its evidence and the command that caused it, the target file is editable, and applying there writes the block. No JavaScript — the page works with scripting off. The server requires a single-use token in the path, answers one `POST`, and closes; it also closes by itself after ten minutes.

## Put a gate on it

```bash
ctxrent check --max-waste 40                    # the latest session
ctxrent check ~/.claude/projects --all           # the whole archive
ctxrent check --all --since 2026-10-30           # only sessions after that date
```

Exit `0` under the threshold, `1` over it (printing the rules that would have helped), `2` when the record cannot be measured. Missing data never passes silently. This is the shape `eslint --max-warnings` and Lighthouse CI use, so it drops into a nightly job or a hook without a new vocabulary:

```bash
# every night, on the machine where the work happens
0 3 * * * ctxrent check ~/.claude/projects --all --max-waste 40 >> ~/.ctxrent/nightly.log
```

## Did it work?

Applying rules changes *future* sessions, not past ones, so the archive average moves slowly and proves little. Compare a window instead:

```bash
ctxrent check --all --since 2026-10-30 --max-waste 40   # after the change
ctxrent check --all --since 2026-10-01 --max-waste 40   # from before it
```

Same command, two dates, and the difference in the reported waste is what the rules bought you. `ctxrent diff` is the stricter test: two variants, one task set, rent and success side by side.

## Compare two variants

```bash
ctxrent init                                  # writes ctxrent.json
ctxrent diff ctxrent.json --a before/ --b after/
```

```json
{
  "runner": "claude",
  "repeat": 3,
  "tasks": [{ "id": "fix-typo", "prompt": "…", "verify": "npm test" }]
}
```

Both variants run over the same tasks, each run in a fresh copy of its directory, and the report gives the delta in rent and in success rate, labelling each task `regressed`, `improved` or `fails in both`. The verifier's exit code is the only judge.

**The verifier is a shell command from your own task set and runs with your permissions.** It is not sandboxed.

## Platforms

| | |
| --- | --- |
| macOS | runs from source or as a package; shell commands through `sh`, browser through `open` |
| Linux | same as macOS, browser through `xdg-open` |
| Windows | package install, commands through `cmd.exe`, runner lookup through `where`, reports opened with `explorer` and URLs with `rundll32` |

CI runs the full suite on Ubuntu, macOS and Windows, and on each of them installs the packed tarball on Node 20 and runs the binary. The platform branches (`sh` vs `cmd.exe`, `open` and `xdg-open` vs `explorer` and `rundll32`, `command -v` vs `where`) are pure functions with unit tests for all three.

One Windows caveat: a prompt handed to an agent runner goes through `cmd.exe`, where `%NAME%` expands even inside quotes. Avoid `%` in task-set prompts there.

## What it reads

Claude Code (`~/.claude/projects/*.jsonl`, `%USERPROFILE%\.claude\projects` on Windows) and Codex (`~/.codex/sessions/**/*.jsonl`). The adapter is detected from the file itself, and coverage is reported per adapter. Session directories are opened read-only.

## Privacy

- No outbound network, ever. The only socket is the loopback review page, bound to `127.0.0.1` on an ephemeral port.
- No telemetry, no account, no upload.
- No runtime dependencies: what you clone is what runs.
- Nothing is written unless you ask: `--html` writes the report you named, `teach --write` and `review` write the block you approved.

## What the numbers can and cannot say

- **Token-turns are a volume, not money.** A re-read token is billed at 0.1× the base input rate and a cache write at 1.25×–2×, per the Anthropic and OpenAI prompt-caching docs. Rent tells you what dominates the prompt, not what the prompt cost. `ctxrent` deliberately reports no currency.
- **Sizes are estimated** at `ceil(chars / 4)` from the recovered text, and labelled `estimated`. Content whose text cannot be recovered is `unknown`, never zero.
- **Coverage is partial by construction.** Session records store deltas; the system prompt, the tool schemas and the cached prefix are never on disk. What the reconstruction cannot account for is reported as a residual, and the report states the share it explains.
- **Compaction ends rent.** Content the record shows as dropped stops paying from that point; a drop of at least 500 tokens and 5% counts as a compaction. Without this rule a long session reports more rent than it spent in tokens.
- **Waste is a heuristic, not a verdict.** The rules are conservative, each claim names its evidence, and `ctxrent diff` is how you prove that removing something did not hurt.
- Codex `input_tokens` already includes cached tokens, so its totals are not directly comparable with Claude Code's cache-split totals.

## How it works

Everything goes through one seam, `run(argv, deps)`, with the filesystem, the clock and the agent runner injected, so the whole tool is testable without network or subprocesses. An adapter turns a session record into turns, each turn carrying the injections that preceded it. Rent, waste and prescriptions are pure functions over those turns; the reports are pure functions over the model.

```
src/adapters/   claude-code, codex, shared content recovery, detection
src/epochs.ts   where a context compaction ends the rent
src/rent.ts     token-turns per carrier
src/waste.ts    the four classes
src/prescriptions.ts, src/teach.ts   advice, evidence, managed block
src/report/     text, html, review page, diff output
src/review.ts   the loopback review server
src/run.ts      the command surface
```

## Development

```bash
npm install          # dev dependencies only: typescript, @types/node
npm test             # 114 tests, runs the TypeScript source, Node 22.18+
npm run typecheck
```

## Releasing

Every push to `main` runs the suite on the three platforms and installs the packed tarball on the minimum supported Node. A release is a tag:

```bash
npm version patch        # or minor, or major: writes package.json and creates v0.1.1
git push --follow-tags
```

The tag must match `package.json`, or the workflow stops before publishing. The publish job runs the tests, builds, and publishes to npm with provenance.

One-time setup before the first release:

- set `repository` in `package.json` (provenance will not publish without it);
- add `NPM_TOKEN` as a repository secret: an npm automation token with publish rights.

## Design

The vocabulary is in [`GLOSSARY.md`](./GLOSSARY.md); the decisions that are hard to reverse are in [`docs/adr/`](./docs/adr/). The research behind the prescriptions, with primary sources, is in [`docs/research/`](./docs/research/).

MIT licensed.
