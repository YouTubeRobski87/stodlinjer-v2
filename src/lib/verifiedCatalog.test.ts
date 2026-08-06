// Tests for the verified catalog + the deterministic search over it.
//
// Run:  npm run test
//   (node --experimental-strip-types; same zero-dependency style as
//    crisisDetect.test.ts — no runner, no network, no paid AI calls.)
//
// The fixtures below are hand-written miniatures of real records, so the suite
// stays deterministic and never depends on the live content collection.

import {
  admissionIssues,
  buildVerifiedCatalog,
  resolveVerifiedIds,
  toVerifiedSupportLine,
  verificationStatus,
  type RawSupportLine,
} from "./verifiedCatalog.ts";
import { searchSupportLines } from "./supportLineSearch.ts";

// ── Tiny assertion harness ──────────────────────────────────────────────────

let pass = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) pass++;
  else failures.push(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
}
function eq<T>(name: string, actual: T, expected: T): void {
  check(name, Object.is(actual, expected), `förväntade: ${String(expected)}\n      fick:        ${String(actual)}`);
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const NOW = new Date("2026-08-06T12:00:00Z");

function raw(over: Partial<RawSupportLine> = {}): RawSupportLine {
  return {
    id: "sjalvmordslinjen",
    slug: "sjalvmordslinjen",
    name: "Självmordslinjen",
    organization: "Mind",
    type: "direct_line",
    status: "active",
    category: { id: "mental_health" },
    shortDescription: "Stöd dygnet runt vid självmordstankar.",
    helpsWith: ["sjalvmordstankar", "rad-och-stod"],
    targetGroups: ["anhoriga"],
    contactMethods: [
      {
        id: "phone",
        channel: "phone",
        label: "Telefon",
        value: "90 101",
        openingHours: [
          { days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], open: "00:00", close: "24:00" },
        ],
      },
      { id: "chat", channel: "chat", label: "Chatt", url: "https://mind.se/chatt/" },
    ],
    accessibility: { anonymous: true, free: true, languages: ["svenska"], region: "sweden" },
    urgency: { level: "standard" },
    source: { primaryUrl: "https://mind.se/sjalvmordslinjen/", checkedAt: "2026-06-04", confidence: "high" },
    display: { featured: true, priority: 90, primaryLabel: "Ring 90 101", availabilityLabel: "Dygnet runt" },
    metadata: { lastVerified: "2026-06-04", nextReview: "2026-12-04" },
    ...over,
  } as RawSupportLine;
}

const EMERGENCY = raw({
  id: "112-sos-alarm",
  slug: "112-sos-alarm",
  name: "112 – SOS Alarm",
  organization: "SOS Alarm",
  type: "public_service",
  category: { id: "acute_emergency" },
  shortDescription: "Vid omedelbar fara för liv, hälsa eller egendom.",
  helpsWith: ["akut-fara", "raddningstjanst", "forgiftning"],
  targetGroups: ["allmanheten"],
  contactMethods: [{ id: "phone", channel: "phone", label: "Telefon", value: "112" }],
  urgency: { level: "emergency", showEmergencyNotice: true },
  source: { primaryUrl: "https://www.sosalarm.se/112/", checkedAt: "2026-06-04", confidence: "high" },
  metadata: { lastVerified: "2026-06-04", nextReview: "2026-12-04", supportLine: false },
});

const EATING = raw({
  id: "atstorningslinjen",
  slug: "atstorningslinjen",
  name: "Ätstörningslinjen – av Frisk & Fri",
  organization: "Frisk & Fri - Riksföreningen mot ätstörningar",
  category: { id: "eating_disorders" },
  shortDescription: "Frisk & Fris stöd vid ätstörningar.",
  helpsWith: ["atstorningar", "anhorigstod"],
  targetGroups: ["drabbade", "anhoriga"],
  contactMethods: [
    { id: "phone", channel: "phone", label: "Ätstörningslinjen", value: "020-20 80 18" },
    { id: "chat", channel: "chat", label: "Chatt", url: "https://www.friskfri.se/fa-stod/chatt/" },
  ],
  source: { primaryUrl: "https://www.friskfri.se/fa-stod/telefonlinjer/", checkedAt: "2026-06-04", confidence: "high" },
  metadata: { lastVerified: "2026-06-04", nextReview: "2026-12-04" },
});

const CATALOG = buildVerifiedCatalog([raw(), EMERGENCY, EATING], NOW).lines;

// ── 1–5: the verified data source ───────────────────────────────────────────

check("1. admitted record becomes verified", toVerifiedSupportLine(raw(), NOW) !== null);
eq("1b. retired record is not admitted", toVerifiedSupportLine(raw({ status: "retired" }), NOW), null);
eq(
  "1c. AI catalog contains only admitted lines",
  buildVerifiedCatalog([raw(), raw({ slug: "gone", status: "retired" })], NOW).lines.length,
  1,
);

check(
  "2. record without official source is rejected",
  admissionIssues(raw({ source: { primaryUrl: "", checkedAt: "", confidence: "high" } })).includes(
    "missing-source-url",
  ),
);
check(
  "2b. record without verification date is rejected",
  admissionIssues(raw({ metadata: { lastVerified: "", nextReview: "" } })).includes("missing-verified-at"),
);
eq(
  "2c. rejected records are reported, not silently dropped",
  buildVerifiedCatalog([raw({ slug: "trasig", source: { primaryUrl: "inte-en-url", checkedAt: "", confidence: "low" } })], NOW)
    .rejected.length,
  1,
);

const v = toVerifiedSupportLine(raw(), NOW)!;
eq("3. phone number returned exactly as stored", v.phoneNumbers[0].number, "90 101");
eq("3b. chat url returned exactly as stored", v.chatUrl, "https://mind.se/chatt/");
eq("3c. source url returned exactly as stored", v.sourceUrl, "https://mind.se/sjalvmordslinjen/");
check("3d. verified line is frozen (read-only)", Object.isFrozen(v));

eq("4. Swedish display label keeps å/ä/ö", v.topics[0], "Självmordstankar");
eq("4b. display label for facet with ö", v.topics[1], "Råd och stöd");
eq("4c. target group label keeps ö", v.targetGroups[0], "Anhöriga");
check("4d. display labels are not ascii slugs", !v.topics.some((t) => /^[a-z-]+$/.test(t)));

eq("5. ascii key kept for internal matching", v.topicKeys[0], "sjalvmordstankar");
check(
  "5b. ascii query still matches a line whose label has diacritics",
  searchSupportLines(CATALOG, { query: "sjalvmordstankar" }).lines.some((l) => l.slug === "sjalvmordslinjen"),
);
check(
  "5c. Swedish-spelled query matches the same line",
  searchSupportLines(CATALOG, { query: "självmordstankar" }).lines.some((l) => l.slug === "sjalvmordslinjen"),
);

// ── 6–10: search ────────────────────────────────────────────────────────────

check(
  "6. relevant query returns the right existing line",
  searchSupportLines(CATALOG, { query: "ätstörningar" }).lines[0]?.slug === "atstorningslinjen",
);

const nonsense = searchSupportLines(CATALOG, { query: "kvantfysik för hamstrar" });
eq("7. unknown topic invents nothing", nonsense.lines.length, 0);
eq("7b. unknown topic reports no match", nonsense.noMatch, true);

const chatOnly = searchSupportLines(CATALOG, {
  query: "stöd",
  userContext: { preferredContactMethod: "chat" },
});
check("8. chat filter keeps only lines with a chat url", chatOnly.lines.every((l) => !!l.chatUrl));
check(
  "8b. phone filter keeps only lines with a phone number",
  searchSupportLines(CATALOG, { query: "stöd", userContext: { preferredContactMethod: "phone" } }).lines.every(
    (l) => l.phoneNumbers.length > 0,
  ),
);

const dupQuery = searchSupportLines(CATALOG, { query: "stöd sjalvmordstankar anhoriga" });
eq(
  "9. no duplicate lines in one result",
  dupQuery.lines.length,
  new Set(dupQuery.lines.map((l) => l.slug)).size,
);

// The merged Frisk & Fri record is one line, not two: searching the
// organisation name must not yield a second entry for the same service.
const orgQuery = searchSupportLines(CATALOG, { query: "frisk fri ätstörningslinjen" });
eq(
  "10. same organisation + service is one line, not two",
  orgQuery.lines.filter((l) => l.organization?.includes("Frisk & Fri")).length,
  1,
);

// ── 11–15: the AI / adapter layer ───────────────────────────────────────────

eq(
  "11. only catalog ids resolve for the model context",
  resolveVerifiedIds(CATALOG, ["sjalvmordslinjen"]).resolved.length,
  1,
);
const hallucinated = resolveVerifiedIds(CATALOG, ["stodlinjen-som-inte-finns", "sjalvmordslinjen"]);
eq("12. hallucinated id is ignored", hallucinated.resolved.length, 1);
eq("12b. hallucinated id is reported for logging", hallucinated.unknown[0], "stodlinjen-som-inte-finns");
eq("12c. duplicate ids collapse to one card", resolveVerifiedIds(CATALOG, ["sjalvmordslinjen", "sjalvmordslinjen"]).resolved.length, 1);

// The model only ever names an id; the contact details are read from the
// catalog afterwards, so a model-supplied number cannot reach a reader.
const modelSaid = { slug: "sjalvmordslinjen", number: "070-000 00 00", url: "https://phishing.example" };
const fromCatalog = resolveVerifiedIds(CATALOG, [modelSaid.slug]).resolved[0];
eq("13. model cannot overwrite the phone number", fromCatalog.phoneNumbers[0].number, "90 101");
eq("13b. model cannot overwrite the url", fromCatalog.chatUrl, "https://mind.se/chatt/");

eq("14. empty model output resolves to nothing", resolveVerifiedIds(CATALOG, []).resolved.length, 0);
eq("14b. blank id is treated as unknown", resolveVerifiedIds(CATALOG, [""]).unknown.length, 1);
eq(
  "14c. empty query returns no invented lines",
  searchSupportLines(CATALOG, { query: "" }).lines.length,
  0,
);

// Provider failure → the deterministic search still answers. No AI in the path.
const providerDown = searchSupportLines(CATALOG, {
  query: "",
  userContext: { needsImmediateHelp: true },
});
eq("15. fallback search works with no model at all", providerDown.lines.length > 0, true);

// ── 16–18: sources ──────────────────────────────────────────────────────────

const all = searchSupportLines(CATALOG, { query: "stöd sjalvmordstankar akut ätstörningar" }).lines;
check("16. every result carries a source url", all.length > 0 && all.every((l) => /^https?:\/\//.test(l.sourceUrl)));
check("16b. each result carries its own source", new Set(all.map((l) => l.sourceUrl)).size === all.length);
check("17. every result carries a verification date", all.every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.verifiedAt)));
eq(
  "18. a record missing its source never becomes a result",
  buildVerifiedCatalog([raw({ slug: "utan-kalla", source: { primaryUrl: "", checkedAt: "", confidence: "low" } })], NOW)
    .lines.length,
  0,
);

// ── 19–22: the emergency path ───────────────────────────────────────────────

const acute = searchSupportLines(CATALOG, { query: "", userContext: { needsImmediateHelp: true } });
eq("19. emergency indicator escalates", acute.emergencyEscalation, true);
eq("19b. emergency resource leads the result", acute.lines[0].slug, "112-sos-alarm");

// A category or contact filter must never be able to hide 112.
const filtered = searchSupportLines(CATALOG, {
  query: "ätstörningar",
  category: "eating_disorders",
  userContext: { needsImmediateHelp: true, preferredContactMethod: "chat" },
});
eq("20. 112 is not hidden behind a filter", filtered.lines[0].slug, "112-sos-alarm");
eq("20b. 112 is not hidden behind an ordinary search", filtered.emergencyEscalation, true);

// The emergency text is data, not generated copy — identical every time.
const a1 = searchSupportLines(CATALOG, { query: "hjälp", userContext: { needsImmediateHelp: true } });
const a2 = searchSupportLines(CATALOG, { query: "annat", userContext: { needsImmediateHelp: true } });
eq("21. emergency result is deterministic", JSON.stringify(a1.lines[0]), JSON.stringify(a2.lines[0]));
eq("21b. emergency contact comes from data", a1.lines[0].phoneNumbers[0].number, "112");
eq("22. emergency path needs no AI provider", acute.lines[0].sourceUrl, "https://www.sosalarm.se/112/");

// ── 23–25: privacy + read-only ──────────────────────────────────────────────

// The result carries no echo of what the person typed — only catalog fields.
const sensitive = "jag heter Anna Andersson och bor på Storgatan 1";
const priv = searchSupportLines(CATALOG, { query: `${sensitive} ätstörningar` });
check("23. free-text query is not echoed into the result", !JSON.stringify(priv).includes("Storgatan"));
check("23b. reason text comes from the catalog, not the query", !JSON.stringify(priv).includes("Anna Andersson"));

// 24 (analytics) is enforced at the call site — the chat client sends no query
// text to analytics. Guarded here by the shape of the contract: a hit exposes
// no request field to forward.
check("24. a result hit carries no request/query field", all.every((l) => !("query" in l)));

// 25: read mode has no write access — the verified objects are frozen and
// mutation attempts do not take effect.
const target = CATALOG[0];
try {
  (target as unknown as { name: string }).name = "Ändrad av AI";
} catch {
  /* strict mode throws; either way the value must not change */
}
check("25. AI read mode cannot mutate catalog data", target.name !== "Ändrad av AI");

// ── Verification status ─────────────────────────────────────────────────────

eq("verification: due far ahead is current", verificationStatus("2026-06-04", "2026-12-04", NOW), "current");
eq("verification: due within 30 days is review-soon", verificationStatus("2026-06-04", "2026-08-20", NOW), "review-soon");
eq("verification: past due is stale", verificationStatus("2025-01-01", "2025-06-01", NOW), "stale");
eq("verification: no date at all is missing", verificationStatus("", "", NOW), "missing");

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`\nVerified catalog + search: ${pass} passed, ${failures.length} failed (${pass + failures.length} total)\n`);
if (failures.length) {
  console.log(failures.join("\n\n"));
  console.log("");
  process.exit(1);
}
console.log("All verified-catalog cases passed.\n");
