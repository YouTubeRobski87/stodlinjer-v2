const baseUrl = process.env.BASE_URL ?? "http://localhost:4321";
const canonicalOrigin = "https://www.stodlinjer.se";

const redirects = {
  "/sidor/cookiepolicy": "/cookiepolicy/",
  "/artiklar/fakta-myter/myten-man-kan-inte-vara-valdsutsatta-sanningen-om-vald-i-nara-relationer": "/artiklar/mans-halsa/man-som-utsatts-for-vald-i-nara-relationer/",
  "/artiklar/rattigheter-skydd/mina-rattigheter-pa-jobbet-nar-jag-mar-psykiskt-daligt": "/artiklar/rattigheter-och-stod/sjukskriven-men-ifragasatt/",
  "/artiklar/faq/sparas-samtalet-nagonstans-efterat": "/integritetspolicy/",
  "/artiklar/rattigheter-skydd/vad-hander-egentligen-nar-jag-gor-en-orosanmalan": "/artiklar/rattigheter-och-stod/orosanmalan-dina-rattigheter/",
  "/artiklar/handlingsguider/hur-hjalper-jag-nagon-nar-orden-kanns-svara": "/artiklar/att-vara-anhorig/att-stotta-utan-att-fixa/",
  "/artiklar/handlingsguider/hur-du-forbereder-dig-infor-svara-samtal-checklista-och-mall": "/artiklar/att-vara-anhorig/att-stotta-utan-att-fixa/",
  "/artiklar/handlingsguider/trygghetsplan-vid-oro-eller-kris-mall-och-steg-for-steg": "/artiklar/akut-och-kris/trygghetsplan-vid-kris/",
  "/samlingar/faq": "/artiklar/",
  "/artiklar/fordjupning/krisreaktioner-vad-hander-i-din-kropp-och-hur-du-atertar-kontrollen": "/artiklar/akut-och-kris/dagarna-efter-en-kris/",
  "/artiklar/handlingsguider/stop-tekniken-sa-anvander-du-den-i-akuta-kanslostormar": "/artiklar/verktyg-och-sjalvhjalp/jordning-nar-du-tappar-fotfastet/",
  "/artiklar/rattigheter-skydd/vad-socialtjansten-maste-gora-nar-nagon-riskerar-att-bli-eller-redan-ar-hemlos": "/artiklar/rattigheter-och-stod/hemlos-utan-att-synas/",
  "/artiklar/samtalsstod/vad-gor-man-nar-nagon-inte-respekterar-ens-granser": "/artiklar/verktyg-och-sjalvhjalp/att-satta-granser-utan-skuld/",
  "/artiklar/samtalsstod/vad-sager-jag-till-mig-sjalv-nar-skammen-over-att-ma-daligt-kommer": "/artiklar/forsta-ditt-maende/tankar-du-skams-over/",
  "/artiklar/fakta-myter/myt-att-soka-hjalp-ar-ett-tecken-pa-svaghet": "/artiklar/rattigheter-och-stod/att-be-om-hjalp-nar-stoltheten-star-i-vagen/",
  "/nar-en-van-mar-daligt": "/artiklar/att-vara-anhorig/nar-nagon-du-alskar-mar-daligt/",
  "/stodkompassen-": "/chatt/",
  "/artiklar/fordjupning/nar-ska-jag-ringa-90101": "/stodlinjer/sjalvmordslinjen/",
  "/www.1177.se": "/stodlinjer/1177-vardguiden/",
};

for (const [oldPath, newPath] of Object.entries(redirects)) {
  for (const suffix of ["", "/"]) {
    const response = await fetch(`${baseUrl}${oldPath}${suffix}?legacy=1`, { redirect: "manual" });
    const expectedLocation = `${canonicalOrigin}${newPath}`;
    if (response.status !== 301 || response.headers.get("location") !== expectedLocation) {
      throw new Error(`${oldPath}${suffix}: expected 301 to ${expectedLocation}`);
    }
  }

  const destination = await fetch(`${baseUrl}${newPath}`);
  if (destination.status !== 200) throw new Error(`${newPath}: expected 200`);
}

for (const oldPath of ["/imgs/web", "/imgs/web/", "/.netlify/functions/chat"]) {
  const response = await fetch(`${baseUrl}${oldPath}`, { redirect: "manual" });
  if (response.status !== 410) throw new Error(`${oldPath}: expected 410`);
}

for (const path of ["/om/", "/sitemap.xml", "/robots.txt"]) {
  const response = await fetch(`${baseUrl}${path}`);
  if (response.status !== 200) throw new Error(`${path}: expected 200`);
}

const noindex = await fetch(`${baseUrl}/stodkompassen-lines.json`);
if (noindex.headers.get("x-robots-tag") !== "noindex, nofollow") {
  throw new Error("/stodkompassen-lines.json: missing noindex header");
}

const friskFri = await fetch(`${baseUrl}/stodlinjer/frisk-fri/`, { redirect: "manual" });
if (friskFri.status !== 301 || friskFri.headers.get("location") !== "/stodlinjer/atstorningslinjen/") {
  throw new Error("/stodlinjer/frisk-fri/: redirect changed");
}

console.log(`Verified ${Object.keys(redirects).length} GSC redirects, technical 410s, and unaffected routes.`);
