# 07: Multi-line prompts through cmd.exe (unverified)

**What to build:** A prompt handed to an agent runner on Windows goes through `cmd.exe`; the audit could not verify on macOS whether cmd cuts it at the first newline. The writer brief is multi-line. Verify on the Windows CI runner; if it is cut, pass the prompt on stdin instead.

**Status:** needs-info

- [ ] A Windows CI result either way
