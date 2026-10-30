---
name: ctxrent
description: Measures the context rent of a coding agent's sessions and turns that evidence into rules for CLAUDE.md or AGENTS.md. Use when the user asks where their tokens go, why a session was slow or expensive, how to reduce context, or wants hygiene rules written from their own session history.
license: MIT
compatibility: Requires the ctxrent CLI on PATH and Node 20 or newer. Reads Claude Code and Codex session records from the user's home directory.
metadata:
  version: "0.1"
  category: developer-tools
allowed-tools: Bash(ctxrent *)
---

# ctxrent

Every token kept in a context is re-sent on each request, so content costs its size multiplied by
the turns it survives. `ctxrent` measures that, and produces findings. You write the rules; the
tool never writes the words.

## Flow

1. Run the analysis and read the findings as JSON:

   ```bash
   ctxrent findings --json
   ```

   Useful: `--since <date>` for recent sessions only, `--min-sessions <n>` (default 3), or a path as
   the first argument to narrow the scope.

   Each finding has `id`, `label` (what was observed, as data), `lever`, `saving` (token-turns),
   `claims`, `sessions`, and `example` (the real command that caused it).

2. Write one rule per finding whose `lever` is `instruction`. Skip `configuration` findings: no
   instruction can change them, and writing one adds noise.

   Put them in `.ctxrent/rules.md`, one per line, exactly in this form:

   ```
   - <the rule> <!-- id: <finding id> -->
   ```

   Constraints: imperative, addressed to the agent, at most 20 words, in the language the user
   writes in, one line per finding, nothing else in the file. Use `label`, `example` and the
   numbers to decide what the rule says.

3. Ask the user to approve, by running:

   ```bash
   ctxrent review --rules .ctxrent/rules.md
   ```

   That opens a page on loopback with the rules you wrote, the ones already in the file, and the
   configuration findings. The user ticks what stays and presses Apply.

## Rules for you

- Never edit the instruction file yourself: the approval page is the only writer.
- If you are not confident about a rule, leave the finding out. A missing rule beats a wrong one.
- Do not invent ids. `ctxrent` drops unrecognised lines and tells the user how many it kept.

## Related commands

- `ctxrent` — the session just finished, as text.
- `ctxrent check --all --since <date>` — the gate: 0 under the threshold, 1 over, 2 unmeasurable.
- `ctxrent audit <path> --html [file]` — a shareable, self-contained report.
