export const SKILL_TEXT = `---
name: ctxrent
description: Measure the context rent of the user's coding-agent sessions and write hygiene rules from the evidence, for the user to approve.
---

# ctxrent

The user's sessions carry a measurable cost: content kept in context is re-sent on every request.
\`ctxrent\` measures it and produces findings. You write the rules; the tool never writes the words.

## Flow

1. Run the analysis and read the findings as JSON:

   \`\`\`bash
   ctxrent findings --json
   \`\`\`

   Useful flags: \`--since <date>\` to look only at recent sessions, \`--min-sessions <n>\` (default 3),
   and a path as the first argument to restrict the scope.

2. Write one rule per finding whose \`lever\` is \`instruction\`. Skip \`configuration\` findings: no
   instruction can change them, and writing one would be noise.

   Write the file \`.ctxrent/rules.md\`, one line per rule, exactly in this form:

   \`\`\`
   - <the rule> <!-- id: <finding id> -->
   \`\`\`

   Constraints: imperative and addressed to the agent, at most 20 words, the language the user
   writes in, one line per finding, nothing else in the file. Use the \`example\` field and the
   numbers from the finding to decide what the rule should say; use the \`label\` to know what the
   pattern is.

3. Ask the user to approve, by running:

   \`\`\`bash
   ctxrent review --rules .ctxrent/rules.md
   \`\`\`

   This opens a page on loopback listing the rules you wrote, the ones already in the file, and
   the configuration findings. The user ticks what stays and presses Apply. Nothing is written
   until they do.

## Rules for you

- Never edit the instruction file yourself: the approval page is the only writer.
- If a finding has no rule you are confident about, leave it out; a missing rule is better than a
  wrong one.
- Do not invent a finding id: \`ctxrent\` drops lines it does not recognise and will tell the user.
`;
