// Shared text-matching primitives for search.
//
// Extracted from supportLineSearch.ts so the article index (built at compile
// time) and the homepage's client-side article search use exactly the same
// normalisation and token rules as the support-line search. One implementation,
// so "sjalvkansla" reaches "självkänsla" identically everywhere.
//
// Deliberately dependency-free and small: this module is bundled into the
// homepage's client script.

/**
 * Folding å/ä/ö lets a query typed either way reach the same records. It is a
 * MATCHING device only: display text always comes from the source record, so
 * the folded form never reaches a reader.
 */
export function foldSwedish(value: string): string {
  return value
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/é/g, "e")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Grammatical filler only — nothing topical. "för" must never be what makes a
// result match, but "hjälp", "barn" and "våld" always must.
const STOPWORDS = new Set([
  "och", "att", "som", "det", "den", "har", "kan", "med", "for", "pa", "av", "en", "ett",
  "jag", "min", "mitt", "mina", "du", "din", "ditt", "vi", "de", "om", "till", "fran",
  "ar", "var", "inte", "man", "sig", "nagon", "nagot", "sa", "men", "eller", "vid",
]);

/** Query side: folded, punctuation-stripped, stopwords and 1-char tokens dropped. */
export function tokenize(value: string): string[] {
  return foldSwedish(value)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Document side: same normalisation as the query, and the same filler is
 * dropped. Keeping stopwords here was actively harmful once prose entered the
 * index — "på" folds to "pa", which is a prefix of "panik", so every article
 * containing "på" matched a search for panic.
 */
export function fieldTokens(...values: string[]): string[] {
  return values.flatMap((v) =>
    foldSwedish(v)
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

/** 2 = exact token, 1 = fuzzy (prefix/interior), 0 = no match. */
export type MatchStrength = 0 | 1 | 2;

/**
 * Token-level match, not raw substring. Substring matching made short tokens
 * hit anything ("for" inside "Riksföreningen"), which is how a nonsense query
 * ends up looking like a real result.
 *
 * Equality always counts. A query that is a prefix of a document word counts
 * from 4 characters, so "angest" reaches "angestforbundet" and "panik" reaches
 * "panikpaslag". An interior match needs 5.
 *
 * The reverse direction — a document word that is a prefix of the query — is
 * capped at two extra characters. That covers Swedish inflection ("psykiatrin"
 * finding "psykiatri") without letting compounds swallow everything: unbounded,
 * it let "sjalv" match a search for "sjalvkansla", so every article mentioning
 * "själv" answered a search for self-esteem.
 */
const MAX_INFLECTION = 2;

export function matchStrength(haystackTokens: string[], t: string): MatchStrength {
  let best: MatchStrength = 0;
  for (const h of haystackTokens) {
    if (h === t) return 2;
    if (t.length >= 4 && h.startsWith(t)) best = 1;
    else if (h.length >= 4 && t.startsWith(h) && t.length - h.length <= MAX_INFLECTION) best = 1;
    else if (t.length >= 5 && h.includes(t)) best = 1;
  }
  return best;
}

export function matchesToken(haystackTokens: string[], t: string): boolean {
  return matchStrength(haystackTokens, t) > 0;
}
