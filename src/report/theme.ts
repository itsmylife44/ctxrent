const STYLE = `
/* Hallmark · v2.0.0 · theme: custom · genre: modern-minimal · critique: one job per screen, numbers over prose */
:root{
  --bg:#0b0d10; --surface:#13171c; --text:#e9ecef; --muted:#949ba5; --line:#242a31;
  --accent:#7ee0a1; --waste:#f2795a; --focus:#9ecbff;
  --font-body:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  --font-num:ui-monospace,SFMono-Regular,Menlo,monospace;
  --measure:66rem; --gap:1.5rem; --radius:8px;
}
@media (prefers-color-scheme: light){
  :root{--bg:#fbfcfa;--surface:#f4f6f3;--text:#14181d;--muted:#5b636e;--line:#dfe3dd;--accent:#1c7a4d;--waste:#b8422a;--focus:#0b5fff}
}
html{overflow-x:clip}
body{overflow-x:clip;margin:0;background:var(--bg);color:var(--text);font:16px/1.55 var(--font-body)}
.wrap{max-width:var(--measure);margin-inline:auto;padding:2.5rem 1.25rem 4rem}
h1{font-size:1.05rem;font-weight:600;margin:0;overflow-wrap:break-word;text-wrap:balance;min-width:0}
h2{font-size:1rem;font-weight:600;margin:2.5rem 0 .75rem;overflow-wrap:break-word;text-wrap:balance;min-width:0}
p{margin:0 0 .75rem;max-width:46rem}
a{color:var(--accent)}
code{font-family:var(--font-num);font-size:.92em}
.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,18rem);gap:var(--gap);align-items:end;border-bottom:1px solid var(--line);padding-bottom:1.75rem;margin-top:1.5rem}
.hero-number{font:600 3.25rem/1 var(--font-num);letter-spacing:-.02em;overflow-wrap:break-word;font-variant-numeric:tabular-nums}
.hero-label{color:var(--muted);font-size:.9rem;margin:.35rem 0 0}
.hero-side{display:flex;flex-direction:column;gap:.75rem;align-items:flex-start}
.score{font:600 1.6rem/1 var(--font-num);font-variant-numeric:tabular-nums}
button{font:600 1rem/1 var(--font-body);color:var(--bg);background:var(--accent);border:0;border-radius:var(--radius);padding:.85rem 1.15rem;cursor:pointer}
button:hover{filter:brightness(1.05)}
button:active{filter:brightness(.92)}
button:disabled{opacity:.55;cursor:not-allowed}
button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.rules{display:grid;gap:.75rem}
.rule{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:1rem;align-items:start;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:1rem}
.rule input{margin-top:.35rem;width:1.05rem;height:1.05rem;accent-color:var(--accent)}
.rule input:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.rule-title{display:block;font-weight:600;overflow-wrap:break-word}
.rule-meta,.rule-eg{display:block;color:var(--muted);font-size:.9rem;overflow-wrap:break-word}
.rule-eg{font-family:var(--font-num);font-size:.85rem}
.saving{font-family:var(--font-num);font-size:.9rem;color:var(--accent);white-space:nowrap;font-variant-numeric:tabular-nums}
.bars{display:grid;gap:.5rem}
.bar{display:grid;grid-template-columns:minmax(0,22rem) minmax(0,1fr) 6.5rem;gap:.75rem;align-items:center}
.bar-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.9rem}
.bar-track{height:.5rem;background:var(--line);border-radius:999px;overflow:hidden}
.bar-fill{display:block;height:100%;background:var(--accent)}
.bar-fill.waste{background:var(--waste)}
.bar-value{font-family:var(--font-num);font-size:.85rem;color:var(--muted);text-align:right;font-variant-numeric:tabular-nums}
.note{color:var(--muted);font-size:.9rem}
.target{display:grid;grid-template-columns:minmax(0,1fr);gap:.4rem;max-width:34rem}
input[type=text]{font:15px/1.4 var(--font-num);color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:.7rem .8rem;width:100%}
table{width:100%;border-collapse:collapse;font-size:.9rem;font-variant-numeric:tabular-nums}
th,td{text-align:left;padding:.5rem .6rem;border-bottom:1px solid var(--line)}
th{font-weight:500;color:var(--muted);font-size:.9rem}
td.num{text-align:right;font-family:var(--font-num);font-variant-numeric:tabular-nums}
footer{margin-top:3rem;border-top:1px solid var(--line);padding-top:1rem;color:var(--muted);font-size:.9rem}
pre{font-family:var(--font-num);font-size:.85rem;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:1rem;overflow-x:auto}
@media (max-width: 52rem){
  .hero{grid-template-columns:minmax(0,1fr)}
  .bar{grid-template-columns:minmax(0,1fr) 6.5rem}
  .bar-track{display:none}
  .rule{grid-template-columns:auto minmax(0,1fr)}
  .saving{grid-column:2;justify-self:start}
}
`;

/** One document shell, so every page shares the same tokens and the same floor. */
export function page(input: { title: string; description: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${input.title}</title>
<meta name="description" content="${input.description}">
<style>${STYLE}</style>
</head>
<body>
<main class="wrap">
${input.body}
</main>
</body>
</html>
`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function short(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}
