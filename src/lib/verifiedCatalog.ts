// The verified catalog — the ONE source AI features are allowed to read from.
//
// Everything an AI surface may say about a support line has to come through
// this module. It takes a raw catalog record (the shape validated by the Zod
// schema in src/content.config.ts) and either admits it as a
// `VerifiedSupportLine` or rejects it with a reason. A record that cannot state
// where its facts came from, and when they were last checked, does not get to
// be an answer to someone looking for help.
//
// Deliberately free of `astro:content` imports so it is pure, testable data
// logic. The Astro adapter lives in stodkompassen.ts, which passes `entry.data`
// straight in.
//
// READ-ONLY BY CONSTRUCTION: nothing here writes, and every returned object is
// frozen. There is no code path from an AI surface back into the content files.

import { detailHours, is247, type Hours } from "./hours.ts";
import { facetLabel } from "./labels.ts";

// ── Raw record: structurally what content.config.ts validates ───────────────

export interface RawContactMethod {
  id: string;
  channel: "phone" | "chat" | "sms" | "email" | "web";
  label: string;
  value?: string;
  url?: string;
  note?: string;
  openingHours?: Hours[];
}

export interface RawSupportLine {
  id: string;
  slug: string;
  name: string;
  organization: string;
  type: "direct_line" | "support_organization" | "organization_contact" | "public_service";
  status: "active" | "paused" | "retired";
  category: { id: string } | string;
  shortDescription: string;
  longDescription?: string;
  helpsWith?: string[];
  targetGroups?: string[];
  contactMethods: RawContactMethod[];
  accessibility: {
    anonymous: boolean;
    free: boolean;
    languages?: string[];
    region?: string;
    notes?: string;
  };
  urgency: {
    level: "emergency" | "urgent" | "standard";
    showEmergencyNotice?: boolean;
    emergencyText?: string;
  };
  source: {
    primaryUrl: string;
    secondaryUrl?: string;
    checkedAt: string;
    sourceUpdatedAt?: string;
    confidence: "high" | "medium" | "low";
  };
  display: { featured: boolean; priority: number; primaryLabel: string; availabilityLabel: string };
  metadata: {
    lastVerified: string;
    nextReview: string;
    resourceKind?: string;
    supportLine?: boolean;
  };
}

// ── The verified shape ──────────────────────────────────────────────────────

export interface VerifiedContact {
  /** Channel as stored — never inferred from prose. */
  channel: "phone" | "chat" | "sms" | "email" | "web";
  /** Swedish display label, e.g. "Närståendelinjen". */
  label: string;
  /** Dialable/addressable value (phone, sms, email), verbatim from the record. */
  value: string | null;
  /** Target URL for chat/web, verbatim from the record. */
  url: string | null;
  note: string | null;
  /** Formatted opening hours. Empty when the record states none. */
  openingHours: { dayRange: string; time: string }[];
  roundTheClock: boolean;
}

/**
 * How specific the cited source page is. A line whose only source is the
 * organisation's front page still answers "where did this come from", but a
 * deep link to the actual page describing the line is better — this flag makes
 * the weaker ones reviewable instead of invisible.
 */
export type SourceSpecificity = "specific-page" | "organisation-root";

export type VerificationStatus = "current" | "review-soon" | "stale" | "missing";

export interface VerifiedSupportLine {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly organization: string | null;
  readonly description: string;
  readonly longDescription: string | null;

  readonly categoryId: string;
  /** Ascii-folded facet keys — internal matching only, never display text. */
  readonly topicKeys: readonly string[];
  readonly targetGroupKeys: readonly string[];
  /** Swedish display labels for the same facets (å/ä/ö intact). */
  readonly topics: readonly string[];
  readonly targetGroups: readonly string[];

  readonly contacts: readonly VerifiedContact[];
  readonly phoneNumbers: readonly { number: string; label: string }[];
  readonly chatUrl: string | null;
  readonly websiteUrl: string | null;
  readonly availabilityNote: string;
  readonly roundTheClock: boolean;

  readonly anonymous: boolean;
  readonly free: boolean;
  readonly languages: readonly string[];

  /** True only when the record itself says urgency.level === "emergency". */
  readonly isEmergencyService: boolean;
  /**
   * False for authorities and knowledge organisations that the data explicitly
   * marks as not-a-support-line. AI copy must not call these "stödlinjer".
   */
  readonly isSupportLine: boolean;

  readonly sourceUrl: string;
  readonly sourceSpecificity: SourceSpecificity;
  readonly verifiedAt: string;
  readonly nextReview: string | null;
  readonly verification: VerificationStatus;
}

// ── Admission ───────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidHttpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidIsoDate(value: string | undefined): boolean {
  return !!value && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * Why a record may not be used by AI features. Empty array = admitted.
 * A record must be able to say what it is, where the facts came from, and when
 * they were last checked.
 */
export function admissionIssues(raw: RawSupportLine): string[] {
  const issues: string[] = [];
  if (!raw?.id?.trim()) issues.push("missing-id");
  if (!raw?.slug?.trim()) issues.push("missing-slug");
  if (!raw?.name?.trim()) issues.push("missing-name");
  if (!raw?.shortDescription?.trim()) issues.push("missing-description");
  if (!isValidHttpUrl(raw?.source?.primaryUrl)) issues.push("missing-source-url");
  if (!isValidIsoDate(raw?.metadata?.lastVerified)) issues.push("missing-verified-at");
  if (raw?.status !== "active") issues.push("not-active");
  if (!Array.isArray(raw?.contactMethods) || raw.contactMethods.length === 0)
    issues.push("no-contact-method");
  return issues;
}

function sourceSpecificityOf(url: string): SourceSpecificity {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    return path === "" ? "organisation-root" : "specific-page";
  } catch {
    return "organisation-root";
  }
}

// ── Verification age ────────────────────────────────────────────────────────
//
// The project's own policy is the `metadata.nextReview` date each record
// carries (currently set six months after lastVerified). Status is derived from
// that rather than from an invented day count, so it can't silently disagree
// with what an editor scheduled.
//
// NOTE (proposal, not implemented): the brief suggested 60 / 90 day bands.
// Applied to today's data every one of the 52 active lines would land in
// "review-soon" at once, which would make the signal useless. If a tighter
// cycle is wanted, shorten `nextReview` in the records — the thresholds below
// follow automatically.
const SOON_DAYS = 30; // flagged this many days before nextReview falls due
const DAY_MS = 86_400_000;

export function verificationStatus(
  verifiedAt: string | undefined,
  nextReview: string | undefined,
  now: Date = new Date(),
): VerificationStatus {
  if (!isValidIsoDate(verifiedAt)) return "missing";
  if (!isValidIsoDate(nextReview)) {
    // No scheduled review: fall back to "a year is too old to trust".
    const age = (now.getTime() - Date.parse(verifiedAt!)) / DAY_MS;
    return age > 365 ? "stale" : "current";
  }
  const due = Date.parse(nextReview!);
  const daysLeft = (due - now.getTime()) / DAY_MS;
  if (daysLeft < 0) return "stale";
  if (daysLeft <= SOON_DAYS) return "review-soon";
  return "current";
}

// ── Mapping ─────────────────────────────────────────────────────────────────

function contactOf(m: RawContactMethod): VerifiedContact {
  const entries = (m.openingHours ?? []) as Hours[];
  return Object.freeze({
    channel: m.channel,
    label: m.label,
    value: m.value ?? null,
    url: m.url ?? null,
    note: m.note ?? null,
    openingHours: Object.freeze(detailHours(entries)),
    roundTheClock: entries.length > 0 && is247(entries),
  }) as VerifiedContact;
}

function categoryIdOf(raw: RawSupportLine): string {
  return typeof raw.category === "string" ? raw.category : raw.category.id;
}

/**
 * Admit a raw record as verified data, or return null when it fails admission.
 * Callers that need the reason should use `admissionIssues()`.
 */
export function toVerifiedSupportLine(
  raw: RawSupportLine,
  now: Date = new Date(),
): VerifiedSupportLine | null {
  if (admissionIssues(raw).length > 0) return null;

  const contacts = raw.contactMethods.map(contactOf);
  const topicKeys = raw.helpsWith ?? [];
  const targetGroupKeys = raw.targetGroups ?? [];

  // Contact details are copied verbatim, never reformatted or reconstructed.
  const phoneNumbers = contacts
    .filter((c) => c.channel === "phone" && c.value)
    .map((c) => Object.freeze({ number: c.value as string, label: c.label }));
  const chatUrl = contacts.find((c) => c.channel === "chat" && c.url)?.url ?? null;

  return Object.freeze({
    id: raw.id,
    slug: raw.slug,
    name: raw.name,
    organization: raw.organization?.trim() ? raw.organization : null,
    description: raw.shortDescription,
    longDescription: raw.longDescription?.trim() ? raw.longDescription : null,

    categoryId: categoryIdOf(raw),
    topicKeys: Object.freeze([...topicKeys]),
    targetGroupKeys: Object.freeze([...targetGroupKeys]),
    topics: Object.freeze(topicKeys.map(facetLabel)),
    targetGroups: Object.freeze(targetGroupKeys.map(facetLabel)),

    contacts: Object.freeze(contacts),
    phoneNumbers: Object.freeze(phoneNumbers),
    chatUrl,
    websiteUrl: raw.source.primaryUrl,
    availabilityNote: raw.display.availabilityLabel,
    roundTheClock: contacts.some((c) => c.roundTheClock),

    anonymous: raw.accessibility.anonymous,
    free: raw.accessibility.free,
    languages: Object.freeze([...(raw.accessibility.languages ?? [])]),

    isEmergencyService: raw.urgency.level === "emergency",
    // Default true: most records are lines. Only an explicit `supportLine:
    // false` (authorities, knowledge orgs) opts out.
    isSupportLine: raw.metadata.supportLine !== false,

    sourceUrl: raw.source.primaryUrl,
    sourceSpecificity: sourceSpecificityOf(raw.source.primaryUrl),
    verifiedAt: raw.metadata.lastVerified,
    nextReview: raw.metadata.nextReview ?? null,
    verification: verificationStatus(raw.metadata.lastVerified, raw.metadata.nextReview, now),
  }) as VerifiedSupportLine;
}

export interface CatalogBuildResult {
  lines: VerifiedSupportLine[];
  /** Records that failed admission, with reasons — for review, not for users. */
  rejected: { slug: string; issues: string[] }[];
}

/** Admit a whole set of raw records. Rejections are reported, never thrown. */
export function buildVerifiedCatalog(
  raws: RawSupportLine[],
  now: Date = new Date(),
): CatalogBuildResult {
  const lines: VerifiedSupportLine[] = [];
  const rejected: { slug: string; issues: string[] }[] = [];
  for (const raw of raws) {
    const issues = admissionIssues(raw);
    // "not-active" is ordinary editorial state (paused/retired), not a data
    // fault — those are simply out of scope, not worth reporting as broken.
    if (issues.length === 0) {
      const line = toVerifiedSupportLine(raw, now);
      if (line) lines.push(line);
    } else if (!issues.includes("not-active")) {
      rejected.push({ slug: raw?.slug ?? raw?.id ?? "(okänd)", issues });
    }
  }
  return { lines, rejected };
}

/**
 * Resolve model-proposed ids against the catalog. Anything not present is
 * dropped and returned in `unknown` — a hallucinated id must never reach a
 * reader, and the caller logs it as a technical fault (id only, no user text).
 */
export function resolveVerifiedIds(
  catalog: readonly VerifiedSupportLine[],
  proposedIds: readonly string[],
): { resolved: VerifiedSupportLine[]; unknown: string[] } {
  const bySlug = new Map(catalog.map((l) => [l.slug, l]));
  const resolved: VerifiedSupportLine[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const id of proposedIds) {
    const hit = bySlug.get(id);
    if (!hit) {
      unknown.push(id);
      continue;
    }
    if (seen.has(hit.slug)) continue; // never show the same line twice
    seen.add(hit.slug);
    resolved.push(hit);
  }
  return { resolved, unknown };
}
