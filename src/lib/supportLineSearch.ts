// Typed, deterministic search over the verified catalog.
//
// This is the authoritative half of "which lines match" — no model involved.
// A language model may later phrase an introduction around the result, but the
// lines, the numbers, the URLs, the hours, the sources and the dates all come
// from here and are rendered verbatim.
//
// Same input → same output, always. That is what makes the emergency path
// testable and what makes it safe to run when the AI provider is down.

import type { VerifiedSupportLine } from "./verifiedCatalog.ts";

export type ContactMethod = "phone" | "chat" | "web";

export interface SupportLineSearchRequest {
  query: string;
  category?: string;
  userContext?: {
    ageGroup?: string;
    preferredContactMethod?: ContactMethod;
    needsImmediateHelp?: boolean;
  };
  limit?: number;
}

/** One result. Every field is copied from verified data — nothing generated. */
export interface SupportLineSearchHit {
  id: string;
  slug: string;
  name: string;
  organization: string | null;
  description: string;
  /** Why this line matched — derived from the match, not written by a model. */
  reason: string;
  phoneNumbers: { number: string; label: string }[];
  chatUrl: string | null;
  websiteUrl: string | null;
  openingHours: { dayRange: string; time: string }[];
  availabilityNote: string;
  isEmergencyService: boolean;
  isSupportLine: boolean;
  sourceUrl: string;
  verifiedAt: string;
  verification: VerifiedSupportLine["verification"];
  score: number;
}

export interface SupportLineSearchResult {
  lines: SupportLineSearchHit[];
  /** True when the request tripped the emergency path. */
  emergencyEscalation: boolean;
  /** True when nothing in the catalog matched — say so, never improvise. */
  noMatch: boolean;
}

const DEFAULT_LIMIT = 5;

// ── Normalisation ───────────────────────────────────────────────────────────
//
// Folding å/ä/ö lets a query typed either way reach the same records. It is a
// MATCHING device only: display text always comes from the verified record, so
// the folded form never reaches a reader.

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
// line match, but "hjälp", "barn" and "våld" always must.
const STOPWORDS = new Set([
  "och", "att", "som", "det", "den", "har", "kan", "med", "for", "pa", "av", "en", "ett",
  "jag", "min", "mitt", "mina", "du", "din", "ditt", "vi", "de", "om", "till", "fran",
  "ar", "var", "inte", "man", "sig", "nagon", "nagot", "sa", "men", "eller", "vid",
]);

function tokenize(value: string): string[] {
  return foldSwedish(value)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Token-level match, not raw substring. Substring matching made short tokens
 * hit anything ("for" inside "Riksföreningen"), which is how a nonsense query
 * ends up looking like a real result. Equality always counts; a prefix counts
 * from 4 characters (so "angest" reaches "angestforbundet"); an interior match
 * needs 5, enough that it is unlikely to be an accident.
 */
function matchesToken(haystackTokens: string[], t: string): boolean {
  for (const h of haystackTokens) {
    if (h === t) return true;
    if (t.length >= 4 && (h.startsWith(t) || t.startsWith(h))) return true;
    if (t.length >= 5 && h.includes(t)) return true;
  }
  return false;
}

function fieldTokens(...values: string[]): string[] {
  return values.flatMap((v) =>
    foldSwedish(v)
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter(Boolean),
  );
}

function hasContact(line: VerifiedSupportLine, method: ContactMethod): boolean {
  switch (method) {
    case "phone":
      return line.phoneNumbers.length > 0;
    case "chat":
      return !!line.chatUrl;
    case "web":
      return !!line.websiteUrl || line.contacts.some((c) => c.channel === "web" && c.url);
  }
}

// ── Scoring ─────────────────────────────────────────────────────────────────
//
// Transparent on purpose: a name hit beats a facet hit beats a prose hit. No
// learned weights, nothing to drift.

const W_NAME = 5;
const W_FACET = 3;
const W_TEXT = 1;

function scoreLine(line: VerifiedSupportLine, tokens: string[]): { score: number; hits: string[] } {
  if (tokens.length === 0) return { score: 0, hits: [] };
  const name = fieldTokens(line.name, line.organization ?? "");
  const facets = fieldTokens(...line.topicKeys, ...line.targetGroupKeys, line.categoryId);
  const text = fieldTokens(line.description, ...line.topics, ...line.targetGroups);

  let score = 0;
  const hits: string[] = [];
  for (const t of tokens) {
    if (matchesToken(name, t)) {
      score += W_NAME;
      hits.push(t);
    } else if (matchesToken(facets, t)) {
      score += W_FACET;
      hits.push(t);
    } else if (matchesToken(text, t)) {
      score += W_TEXT;
      hits.push(t);
    }
  }
  return { score, hits };
}

/**
 * Match reason, assembled from the record — never model prose. Uses the
 * Swedish display labels so the text a reader sees keeps its å/ä/ö.
 */
function reasonFor(line: VerifiedSupportLine, hits: string[], emergency: boolean): string {
  if (emergency && line.isEmergencyService) return "Akutresurs vid omedelbar fara.";
  const folded = new Set(hits);
  const matchedTopics = line.topics.filter((t, i) =>
    folded.has(foldSwedish(line.topicKeys[i] ?? t)) || [...folded].some((h) => foldSwedish(t).includes(h)),
  );
  if (matchedTopics.length > 0) {
    return `Matchar: ${matchedTopics.slice(0, 3).join(", ")}.`;
  }
  return line.description;
}

function toHit(line: VerifiedSupportLine, score: number, hits: string[], emergency: boolean): SupportLineSearchHit {
  return {
    id: line.id,
    slug: line.slug,
    name: line.name,
    organization: line.organization,
    description: line.description,
    reason: reasonFor(line, hits, emergency),
    // Verbatim copies — the caller renders these as-is.
    phoneNumbers: line.phoneNumbers.map((p) => ({ number: p.number, label: p.label })),
    chatUrl: line.chatUrl,
    websiteUrl: line.websiteUrl,
    openingHours: line.contacts[0]?.openingHours.map((h) => ({ ...h })) ?? [],
    availabilityNote: line.availabilityNote,
    isEmergencyService: line.isEmergencyService,
    isSupportLine: line.isSupportLine,
    sourceUrl: line.sourceUrl,
    verifiedAt: line.verifiedAt,
    verification: line.verification,
    score,
  };
}

/**
 * Search the verified catalog.
 *
 * The emergency path comes first and is unconditional: when
 * `needsImmediateHelp` is set, every emergency resource in the catalog leads
 * the result regardless of query, category or contact preference. It never
 * waits for a model and never depends on one.
 */
export function searchSupportLines(
  catalog: readonly VerifiedSupportLine[],
  request: SupportLineSearchRequest,
): SupportLineSearchResult {
  const limit = Math.max(1, request.limit ?? DEFAULT_LIMIT);
  const emergency = request.userContext?.needsImmediateHelp === true;
  const tokens = tokenize(request.query ?? "");

  // Emergency resources are pinned to the top and are exempt from the category
  // and contact-method filters — a filter must never be able to hide 112.
  const emergencyHits = emergency
    ? catalog.filter((l) => l.isEmergencyService).map((l) => toHit(l, Number.MAX_SAFE_INTEGER, [], true))
    : [];
  const pinned = new Set(emergencyHits.map((h) => h.slug));

  const method = request.userContext?.preferredContactMethod;
  const scored = catalog
    .filter((l) => !pinned.has(l.slug))
    .filter((l) => !request.category || l.categoryId === request.category)
    .filter((l) => !method || hasContact(l, method))
    .map((l) => ({ line: l, ...scoreLine(l, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.line.name.localeCompare(b.line.name, "sv"))
    .map((r) => toHit(r.line, r.score, r.hits, emergency));

  const lines = [...emergencyHits, ...scored].slice(0, Math.max(limit, emergencyHits.length));

  return {
    lines,
    emergencyEscalation: emergency && emergencyHits.length > 0,
    // An emergency escalation is always a real answer, so it is never "no match".
    noMatch: lines.length === 0,
  };
}
