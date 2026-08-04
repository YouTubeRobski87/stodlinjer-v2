import type { APIRoute } from "astro";

// robots.txt, prerendered at build time. The sitemap URL is built from the
// configured `site` so it cannot drift from astro.config.mjs.

const FALLBACK_SITE = "https://www.stodlinjer.se";

export const GET: APIRoute = ({ site }) => {
  const sitemapUrl = new URL("/sitemap.xml", site?.href ?? FALLBACK_SITE).href;

  const body = `User-agent: *
Allow: /

Sitemap: ${sitemapUrl}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
