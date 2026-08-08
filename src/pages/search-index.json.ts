import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { getArticleCollection } from "../lib/articleCollections";

// Static search index for published articles, built at compile time and
// fetched by the homepage only once someone starts typing. Support lines are
// NOT in here — they are already server-rendered as cards on the homepage and
// filtered in place, so duplicating them would only add weight.
//
// Prerendered on purpose: this is derived from content, never per-request, so
// it costs nothing at runtime and survives an origin restart.
export const prerender = true;

export interface ArticleSearchDoc {
  type: "article";
  title: string;
  description: string;
  tags: string[];
  /** Topic slug (folder) + its display label, e.g. "akut-och-kris" / "Akut och kris". */
  collection: string;
  collectionLabel: string;
  url: string;
}

export const GET: APIRoute = async () => {
  // Same filter as the article routes and the sitemap. A draft must never be
  // discoverable, and search is a discovery surface.
  const articles = await getCollection("articles", (e) => !e.data.draft);

  const seen = new Set<string>();
  const docs: ArticleSearchDoc[] = [];

  for (const entry of articles) {
    const meta = getArticleCollection(entry.data.collection);
    const slug = entry.id.split("/").pop()!;
    const url = `/artiklar/${meta.slug}/${slug}/`;
    if (seen.has(url)) continue;
    seen.add(url);

    docs.push({
      type: "article",
      title: entry.data.title,
      description: entry.data.description,
      tags: entry.data.tags,
      collection: meta.slug,
      collectionLabel: meta.label,
      url,
    });
  }

  docs.sort((a, b) => a.title.localeCompare(b.title, "sv"));

  return new Response(JSON.stringify(docs), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
