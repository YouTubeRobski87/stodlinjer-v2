import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { ARTICLE_COLLECTIONS } from "../lib/articleCollections";

// XML sitemap for search engines, prerendered at build time like the rest of
// the static output.
//
// Every URL here is derived from the same collections and filters the page
// routes use, so the sitemap cannot drift from what actually gets built:
//   • /artiklar/<collection>/         → ARTICLE_COLLECTIONS (articleCollections.ts)
//   • /artiklar/<collection>/<slug>/  → articles, non-draft   ([slug].astro)
//   • /stodlinjer/<slug>/             → supportLines, active  ([slug].astro)

// Fallback if `site` is somehow unset in astro.config.mjs; the config value
// wins whenever it is present.
const FALLBACK_SITE = "https://www.stodlinjer.se";

type SitemapEntry = {
  /** Root-relative path, always with a leading and trailing slash. */
  path: string;
  /** YYYY-MM-DD. Omitted when the source has no usable date. */
  lastmod?: string;
};

/** Escapes the five XML predefined entities. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Normalises a date to the YYYY-MM-DD form <lastmod> accepts. Returns
 * undefined for missing or unparsable values so the tag is left out rather
 * than emitting an invalid date.
 */
function toLastmod(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

function renderUrl(entry: SitemapEntry, origin: string): string {
  const loc = escapeXml(new URL(entry.path, origin).href);
  const lastmod = entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : "";
  return `  <url>\n    <loc>${loc}</loc>${lastmod}\n  </url>`;
}

export const GET: APIRoute = async ({ site }) => {
  const origin = site?.href ?? FALLBACK_SITE;

  // Same filters as the page routes: drafts and non-active lines are not built,
  // so they must not be advertised either.
  const articles = await getCollection("articles", (entry) => !entry.data.draft);
  const supportLines = await getCollection(
    "supportLines",
    (entry) => entry.data.status === "active",
  );

  const staticPages: SitemapEntry[] = [
    { path: "/" },
    { path: "/artiklar/" },
    { path: "/chatt/" },
  ];

  const collectionPages: SitemapEntry[] = ARTICLE_COLLECTIONS.map((collection) => ({
    path: `/artiklar/${collection.slug}/`,
  }));

  const articlePages: SitemapEntry[] = articles.map((entry) => ({
    // Mirrors [slug].astro: the collection comes from frontmatter and the slug
    // is the file name, not the full nested id.
    path: `/artiklar/${entry.data.collection}/${entry.id.split("/").pop()}/`,
    lastmod: toLastmod(entry.data.updated ?? entry.data.date),
  }));

  const supportLinePages: SitemapEntry[] = supportLines.map((line) => ({
    path: `/stodlinjer/${line.data.slug}/`,
    lastmod: toLastmod(line.data.metadata.lastVerified),
  }));

  const entries = [
    ...staticPages,
    ...collectionPages,
    ...articlePages,
    ...supportLinePages,
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((entry) => renderUrl(entry, origin)).join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
