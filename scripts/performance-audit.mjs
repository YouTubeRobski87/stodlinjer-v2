import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const DIST_DIRECTORY = path.resolve("dist");

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function findHomepage() {
  // Astro's Node adapter writes prerendered pages to dist/client. Keep a
  // fallback for adapters that write index.html directly under dist/.
  const candidates = [
    path.join(DIST_DIRECTORY, "client", "index.html"),
    path.join(DIST_DIRECTORY, "index.html"),
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }

  throw new Error(
    "Could not find a built homepage. Run `npm run build` before `npm run perf:audit`.",
  );
}

async function findAssets(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /\.(?:js|css)$/i.test(entry.name))
        .map(async (entry) => {
          const filePath = path.join(directory, entry.name);
          return { name: entry.name, bytes: (await stat(filePath)).size };
        }),
    );
  } catch {
    return [];
  }
}

function countMatches(html, pattern) {
  return [...html.matchAll(pattern)].length;
}

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

try {
  const homepagePath = await findHomepage();
  const html = await readFile(homepagePath, "utf8");
  const assetDirectory = path.join(path.dirname(homepagePath), "_astro");
  const assets = (await findAssets(assetDirectory))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10);

  // Deliberately approximate: this mirrors the broad HTML tag count used for
  // the initial baseline and is intended for comparing future builds.
  const startTags = countMatches(html, /<(?!(?:!|\/))[^>]+>/g);
  const h1 = countMatches(html, /<h1(?:\s|>)/gi);
  const h2 = countMatches(html, /<h2(?:\s|>)/gi);
  const h3 = countMatches(html, /<h3(?:\s|>)/gi);
  const totalHeadings = countMatches(html, /<h[1-6](?:\s|>)/gi);
  const dialogs = countMatches(html, /<dialog(?:\s|>)/gi);
  const hiddenDetailPanels = countMatches(
    html,
    /<(?:div|section)\b(?=[^>]*\bclass="[^"]*\bline-panel\b[^"]*")(?=[^>]*\bhidden(?:\s|=|>))[^>]*>/gi,
  );
  const jsonLdScripts = countMatches(html, /<script[^>]*type="application\/ld\+json"[^>]*>/gi);

  console.log("Performance audit");
  console.log(`Homepage: ${path.relative(process.cwd(), homepagePath)}`);
  console.log(`Homepage HTML: ${Buffer.byteLength(html)} bytes / ${formatKiB(Buffer.byteLength(html))}`);
  console.log(`Start tags (approx.): ${startTags}`);
  console.log(`Headings: ${totalHeadings} (h1: ${h1}, h2: ${h2}, h3: ${h3})`);
  console.log(`Dialogs: ${dialogs}`);
  console.log(`Hidden support-line detail panels: ${hiddenDetailPanels}`);
  console.log(`JSON-LD scripts: ${jsonLdScripts}`);

  if (assets.length) {
    console.log("\nLargest JS/CSS assets:");
    for (const asset of assets) {
      console.log(`- ${asset.name} ${formatKiB(asset.bytes)}`);
    }
  } else {
    console.log("\nLargest JS/CSS assets: no dist/client/_astro directory found.");
  }
} catch (error) {
  console.error(`Performance audit failed: ${error.message}`);
  process.exitCode = 1;
}
