# Local-only, zero runtime dependencies

ctxrent reads session logs in place, never opens a network connection, and ships no runtime dependencies. Profiling is only as good as the willingness to point the tool at real prompts, so any upload, telemetry, or external service is fatal to adoption. Consequence: no hosted leaderboard and no remote aggregation; anything shared leaves the machine as a file the user generated.
