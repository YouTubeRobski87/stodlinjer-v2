import { defineMiddleware } from "astro:middleware";

const CANONICAL_ORIGIN = "https://www.stodlinjer.se";

// Permanent v1 → v2 mappings for URLs reported by Google Search Console.
// Keys are kept without a trailing slash so each mapping also covers the
// equivalent URL with one or more trailing slashes.
const LEGACY_REDIRECTS: Readonly<Record<string, string>> = {
  "/artiklar/rattigheter-skydd/vilket-ansvar-har-socialtjansten-nar-jag-har-ett-beroende-eller-missbruk":
    "/artiklar/beroende-och-missbruk/socialtjanstens-ansvar-vid-missbruk/",
  "/artiklar/samtalsstod/vad-sager-jag-nar-jag-vill-satta-granser-pa-ett-tryggt-satt":
    "/artiklar/verktyg-och-sjalvhjalp/att-satta-granser-utan-skuld/",
  "/artiklar/samtalsstod/vad-gor-man-nar-nagon-inte-respekterar-ens-granser":
    "/artiklar/verktyg-och-sjalvhjalp/att-satta-granser-utan-skuld/",
  "/artiklar/rattigheter-skydd/vad-hander-egentligen-nar-jag-gor-en-orosanmalan":
    "/artiklar/rattigheter-och-stod/orosanmalan-dina-rattigheter/",
  "/artiklar/handlingsguider/trygghetsplan-vid-oro-eller-kris-mall-och-steg-for-steg":
    "/artiklar/akut-och-kris/trygghetsplan-vid-kris/",
  "/artiklar/handlingsguider/nar-nagon-far-ett-panikpaslag-framfor-dig-konkreta-steg-som-lugnar":
    "/artiklar/akut-och-kris/nar-nagon-far-ett-panikpaslag/",
  "/artiklar/samtalsstod/vad-sager-jag-nar-ett-barn-eller-en-ung-person-berattar-nagot-svart":
    "/artiklar/att-vara-anhorig/nar-ett-barn-berattar-nagot-svart/",
  "/artiklar/samtalsstod/vad-sager-jag-till-mig-sjalv-nar-skammen-over-att-ma-daligt-kommer":
    "/artiklar/forsta-ditt-maende/tankar-du-skams-over/",
  "/nar-en-van-mar-daligt":
    "/artiklar/att-vara-anhorig/nar-nagon-du-alskar-mar-daligt/",
  "/artiklar/rattigheter-skydd/skalig-levnadsniva-vad-betyder-det-egentligen-i-praktiken":
    "/artiklar/rattigheter-och-stod/vad-betyder-skalig-levnadsniva/",
  "/samlingar/rattigheter-skydd": "/artiklar/rattigheter-och-stod/",
};

function withoutTrailingSlashes(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export const onRequest = defineMiddleware((context, next) => {
  const legacyPath = withoutTrailingSlashes(context.url.pathname);
  const target = LEGACY_REDIRECTS[legacyPath];

  if (target) {
    return Response.redirect(`${CANONICAL_ORIGIN}${target}`, 301);
  }

  return next();
});
