import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  site: "https://www.stodlinjer.se",
  // Public pages opt into static prerendering individually. Server output is
  // needed for permanent redirects and the Stödkompassen endpoints, which the
  // Node adapter serves. Deployed as a Node web service on Render
  // (build: `npm run build`, start: `node ./dist/server/entry.mjs`).
  output: "server",
  adapter: node({ mode: "standalone" }),
});
