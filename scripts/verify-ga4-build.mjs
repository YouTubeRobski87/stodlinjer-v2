import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const EXPECTED_MEASUREMENT_ID = "G-333BFW1N0N";
const CLIENT_DIRECTORY = path.resolve("dist", "client");
const TAG_LOADER_PREFIX = "https://www.googletagmanager.com/gtag/js?id=";

async function findHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findHtmlFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".html") ? [entryPath] : [];
    }),
  );

  return nested.flat();
}

function count(text, search) {
  return text.split(search).length - 1;
}

const htmlFiles = await findHtmlFiles(CLIENT_DIRECTORY);
if (htmlFiles.length === 0) {
  throw new Error("No generated HTML found under dist/client. Run the Astro build first.");
}

const failures = [];

for (const filePath of htmlFiles) {
  const html = await readFile(filePath, "utf8");
  const relativePath = path.relative(process.cwd(), filePath);
  const loaderUrl = `${TAG_LOADER_PREFIX}${EXPECTED_MEASUREMENT_ID}`;
  const consentIndex = html.search(/gtag\(["']consent["'],\s*["']default["']/);
  const configIndex = html.search(/gtag\(["']config["']/);
  const unexpectedIds = [...html.matchAll(/\bG-[A-Z0-9]+\b/g)]
    .map(([id]) => id)
    .filter((id) => id !== EXPECTED_MEASUREMENT_ID);

  if (count(html, loaderUrl) !== 1) {
    failures.push(`${relativePath}: expected exactly one GA4 loader for ${EXPECTED_MEASUREMENT_ID}`);
  }
  if (count(html, TAG_LOADER_PREFIX) !== 1) {
    failures.push(`${relativePath}: expected exactly one gtag.js loader`);
  }
  if (configIndex === -1 || count(html, 'gtag("config"') !== 1) {
    failures.push(`${relativePath}: expected exactly one GA4 config call`);
  }
  if (consentIndex === -1 || consentIndex > configIndex) {
    failures.push(`${relativePath}: Consent Mode default must run before GA4 config`);
  }
  if (!html.includes('analytics_storage:"denied"') && !html.includes('analytics_storage: "denied"')) {
    failures.push(`${relativePath}: analytics storage is not denied by default`);
  }
  if (unexpectedIds.length > 0) {
    failures.push(`${relativePath}: unexpected measurement ID(s): ${[...new Set(unexpectedIds)].join(", ")}`);
  }
}

if (failures.length > 0) {
  throw new Error(`GA4 build verification failed:\n${failures.join("\n")}`);
}

console.log(
  `GA4 build verification passed for ${htmlFiles.length} generated pages (${EXPECTED_MEASUREMENT_ID}).`,
);
