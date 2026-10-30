# 08: Skill and MCP attribution

**What to build:** Where a session record attributes usage to a skill or an MCP tool, that rent is reported separately so that the cost of a skill can be weighed against what it contributed.

**Blocked by:** 04.

**Status:** done

- [x] Sessions carrying attribution fields report rent per skill and per MCP tool
- [x] Sessions without those fields report the metric as unavailable, with coverage stated
- [x] Attribution never reassigns rent that is already attributed to another carrier
- [x] The terminal and HTML reports both show the per-skill section when available

## Comments

The Claude Code adapter reads `attributionSkill` and `attributionMcpTool` per record and attributes the rent accrued by the injections introduced in that turn.

- Sessions without those fields report `skills: null`, never an empty list that reads as zero.
- Attribution never reassigns rent already attributed to a carrier: the carrier table and the skill table are two views of the same rent.
- Both reports show a skills section when available, and say it is unavailable when not.
