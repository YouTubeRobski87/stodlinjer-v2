// Frisk & Fri and Ätstörningslinjen were merged into one catalog entry
// (src/content/support-lines/atstorningslinjen.json) — Frisk & Fri is the
// organisation behind the line, not a separate support line. This keeps the
// old URL alive with a real 301 instead of a 404.
//
// A named route beats the [slug] route, and `prerender = false` lets the Node
// adapter answer with a genuine 301 rather than a meta-refresh page.
export const prerender = false;

const TARGET = "/stodlinjer/atstorningslinjen/";

export const GET = () =>
  new Response(null, { status: 301, headers: { Location: TARGET } });
