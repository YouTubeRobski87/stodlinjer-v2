import { defineMiddleware } from "astro:middleware";

const CANONICAL_ORIGIN = "https://www.stodlinjer.se";

// Permanent v1 → v2 mappings for URLs reported by Google Search Console.
// Keys are kept without a trailing slash so each mapping also covers the
// equivalent URL with one or more trailing slashes.
const LEGACY_REDIRECTS: Readonly<Record<string, string>> = {
  "/sidor/cookiepolicy": "/cookiepolicy/",
  "/artiklar/fakta-myter/myten-man-kan-inte-vara-valdsutsatta-sanningen-om-vald-i-nara-relationer":
    "/artiklar/mans-halsa/man-som-utsatts-for-vald-i-nara-relationer/",
  "/artiklar/rattigheter-skydd/mina-rattigheter-pa-jobbet-nar-jag-mar-psykiskt-daligt":
    "/artiklar/rattigheter-och-stod/sjukskriven-men-ifragasatt/",
  "/artiklar/faq/sparas-samtalet-nagonstans-efterat": "/integritetspolicy/",
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
  "/artiklar/handlingsguider/hur-hjalper-jag-nagon-nar-orden-kanns-svara":
    "/artiklar/att-vara-anhorig/att-stotta-utan-att-fixa/",
  "/artiklar/handlingsguider/hur-du-forbereder-dig-infor-svara-samtal-checklista-och-mall":
    "/artiklar/att-vara-anhorig/att-stotta-utan-att-fixa/",
  "/artiklar/samtalsstod/vad-sager-jag-nar-ett-barn-eller-en-ung-person-berattar-nagot-svart":
    "/artiklar/att-vara-anhorig/nar-ett-barn-berattar-nagot-svart/",
  "/artiklar/samtalsstod/vad-sager-jag-till-mig-sjalv-nar-skammen-over-att-ma-daligt-kommer":
    "/artiklar/forsta-ditt-maende/tankar-du-skams-over/",
  "/nar-en-van-mar-daligt":
    "/artiklar/att-vara-anhorig/nar-nagon-du-alskar-mar-daligt/",
  "/artiklar/rattigheter-skydd/skalig-levnadsniva-vad-betyder-det-egentligen-i-praktiken":
    "/artiklar/rattigheter-och-stod/vad-betyder-skalig-levnadsniva/",
  "/samlingar/rattigheter-skydd": "/artiklar/rattigheter-och-stod/",
  "/samlingar/faq": "/artiklar/",
  "/artiklar/fordjupning/krisreaktioner-vad-hander-i-din-kropp-och-hur-du-atertar-kontrollen":
    "/artiklar/akut-och-kris/dagarna-efter-en-kris/",
  "/artiklar/handlingsguider/stop-tekniken-sa-anvander-du-den-i-akuta-kanslostormar":
    "/artiklar/verktyg-och-sjalvhjalp/jordning-nar-du-tappar-fotfastet/",
  "/artiklar/rattigheter-skydd/vad-socialtjansten-maste-gora-nar-nagon-riskerar-att-bli-eller-redan-ar-hemlos":
    "/artiklar/rattigheter-och-stod/hemlos-utan-att-synas/",
  "/artiklar/fakta-myter/myt-att-soka-hjalp-ar-ett-tecken-pa-svaghet":
    "/artiklar/rattigheter-och-stod/att-be-om-hjalp-nar-stoltheten-star-i-vagen/",
  "/stodkompassen-": "/chatt/",
  "/artiklar/fordjupning/nar-ska-jag-ringa-90101": "/stodlinjer/sjalvmordslinjen/",
  "/www.1177.se": "/stodlinjer/1177-vardguiden/",
};

const GONE_PATHS = new Set(["/imgs/web", "/.netlify/functions/chat"]);

function withoutTrailingSlashes(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export const onRequest = defineMiddleware((context, next) => {
  const legacyPath = withoutTrailingSlashes(context.url.pathname);

  if (GONE_PATHS.has(legacyPath)) {
    return new Response(null, { status: 410 });
  }

  const target = LEGACY_REDIRECTS[legacyPath];

  if (target) {
    return Response.redirect(`${CANONICAL_ORIGIN}${target}`, 301);
  }

  return next();
});
