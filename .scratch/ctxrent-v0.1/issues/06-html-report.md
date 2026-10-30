# 06: HTML single-file report

**What to build:** `--html <file>` writes one self-contained document with the score, the rent split and the top carriers, which opens offline with no external reference and can be attached to a message.

**Blocked by:** 05.

**Status:** done

- [x] The produced file contains no external script, style, font or image reference
- [x] Opening it offline renders score, split and top offenders
- [x] The document states the session identifier and the coverage figure
- [x] The structure is covered by a golden test

## Comments

Implemented in `src/report/html.ts` as one self-contained document: inline CSS, no script, no external font, image or link. A test asserts the absence of `http(s)://`, `<script` and `<link`.

- Carrier names are HTML-escaped; a test feeds a carrier containing a script tag and asserts it is neutralised.
- The hero states rent, score, waste and turns. Aggregate reports cap the table at the 100 highest-rent sessions and say so.
- Real data: the whole archive renders to 26 KB.
