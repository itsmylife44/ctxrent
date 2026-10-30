---
name: ctxrent
description: Context rent of the user's coding-agent sessions, turned into approved rules for CLAUDE.md or AGENTS.md. Use when the user runs /ctxrent, asks where their tokens or context go, why sessions are slow or expensive, or wants hygiene rules from their own session history.
license: MIT
compatibility: Node 20 or newer. Reads Claude Code and Codex session records under the user's home directory. Runs the ctxrent CLI from PATH, or from its GitHub release through npx when it is not installed.
metadata:
  version: "0.1.0"
  category: developer-tools
allowed-tools: Bash(ctxrent *) Bash(npx -y --package=https://github.com/itsmylife44/ctxrent/releases/download/* ctxrent *)
---

# ctxrent

Content kept in a context is re-sent on every request, so it costs its size times the turns it
survives: its rent. `ctxrent` measures rent and returns findings. You turn the findings into rules;
the user approves them on a page. Run the whole flow yourself, start to finish; the only thing the
user does is tick and press Apply.

If the user asked for something narrower (a gate, a shareable report, a comparison), skip to
[Other requests](#other-requests).

## 1. Get the command

If `ctxrent --help` succeeds, the command is `ctxrent`. Otherwise it is:

```bash
npx -y --package=https://github.com/itsmylife44/ctxrent/releases/download/v0.1.0/ctxrent-0.1.0.tgz ctxrent
```

That runs the released CLI without installing anything. Below, `ctxrent` means whichever one works.

Done when `ctxrent --help` prints the usage.

## 2. Measure

```bash
ctxrent findings --json
```

Narrow it if the user asked: `--since <date>`, a session path as the first argument,
`--min-sessions <n>` (default 3).

Each finding has `id`, `label` (what was observed, as data), `lever`, `saving` (token-turns),
`claims`, `sessions` and `example` (the real command that caused it).

If `findings` is empty, run `ctxrent` alone, show the user the last session's rent, score and top
carriers, and stop: there is nothing recurring to write a rule for.

Done when you hold the JSON.

## 3. Write the rules

One rule per finding whose `lever` is `instruction`. A `configuration` finding gets no rule: it is
caused by a hook or a setting, and the page shows it to the user as such.

Write them to `ctxrent-rules.md` in the system temp directory, outside the user's project, one per
line, exactly:

```
- <the rule> <!-- id: <finding id> -->
```

Each rule is imperative, addressed to the agent, at most 20 words, in the language the user writes
in. Decide what it says from `label`, `example` and the numbers. Leave a finding out when you are
not confident about its rule: a missing rule beats a wrong one. Copy ids from the JSON only;
`ctxrent` drops any line whose id it does not know.

Done when every `instruction` finding has one line or was left out on purpose, and the file holds
nothing else.

## 4. Get approval

The target is the global instruction file of the harness you run in: `~/.claude/CLAUDE.md` for
Claude Code, `~/.codex/AGENTS.md` for Codex, or the file the user named.

```bash
ctxrent review --rules <rules file> --write <target>
```

It prints a loopback URL, opens the browser, and waits up to ten minutes for the user to press
Apply. Run it in the background or with a timeout of at least ten minutes, because a shorter
timeout kills the page. As soon as the URL is printed, give it to the user with one line per
finding: the amount, the example, and for `configuration` findings the hook or setting to turn off.

The page is the only writer of the instruction file. Your edits stop at the rules file.

Done when the command exits. Report its last line: `applied N rule(s) to <file>`, or
`closed without changes`.

## Other requests

- A gate: `ctxrent check --max-waste <n>`, or `--all --since <date>` for the archive. Exit 0 under
  the threshold, 1 over, 2 when the record cannot be measured.
- A shareable report: `ctxrent audit <path> --html <file>`, one self-contained file.
- A comparison of two variants: `ctxrent init`, then `ctxrent diff ctxrent.json --a <dir> --b <dir>`.
