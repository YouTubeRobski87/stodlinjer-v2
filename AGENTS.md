# Agentinstruktioner — Stödlinjer.se

Den här sajten läses av människor som mår dåligt och behöver hitta hjälp snabbt.
Ett påhittat telefonnummer är inte en bugg här, det är någon som ringer fel när
det brådskar. Reglerna nedan gäller allt AI-arbete i repot — både kod du skriver
och svar som Stödkompassen genererar.

## Verifierad data är enda källan

- Telefonnummer, chattlänkar, webbadresser och öppettider **måste** komma från
  `src/content/support-lines/*.json` via [`src/lib/verifiedCatalog.ts`](src/lib/verifiedCatalog.ts).
- Skapa aldrig kontaktuppgifter ur modellminne, ur artikeltext, ur en gammal
  version av sajten eller genom att gissa utifrån ett organisationsnamn.
- Gör inga fria webbsökningar för att fylla i en uppgift i ett användarsvar.
  Extern research kan användas för att *föreslå en redigering till en människa*,
  aldrig som källa i ett svar som går direkt till en läsare.
- Kombinera aldrig uppgifter från två poster till en. Varje resurs står för sig.
- Saknas en uppgift i katalogen: säg att den saknas. Fyll inte i luckan.

## Källa och verifieringsdatum krävs

- Varje post som får användas av AI måste ha `source.primaryUrl` och
  `metadata.lastVerified`. Utan dem avvisas posten av admissionskontrollen och
  syns inte i AI-katalogen — det är avsiktligt, laga datan i stället för att
  lätta på kravet.
- Varje rekommendation som visas ska bära sin egen källa och sitt eget datum.
  Länka till den specifika sidan hos organisationen när en sådan finns, inte
  bara till startsidan.
- Ändrade kontaktuppgifter kräver verifiering mot officiell källa och att
  `lastVerified` uppdateras i samma ändring.

## Katalogen är läsbar, inte skrivbar, för AI

- AI-lagret får söka, filtrera, rangordna och sammanfatta. Det får inte skapa,
  ändra eller radera poster, och inte röra verifieringsdatum.
- Objekten från `verifiedCatalog.ts` är frysta. Håll dem så.
- Modellen väljer bara **vilken** post som ska visas (via `[[line:slug]]`).
  Kortet renderas alltid från verifierad data på klienten — kontaktuppgifter
  passerar aldrig genom modellens text.
- Ett post-ID som inte finns i katalogen ska ignoreras och loggas som tekniskt
  fel (endast ID:t, aldrig användarens text).

## Akutflödet går först

- `src/lib/crisisDetect.ts` körs före modellanropet och får inte försvagas.
- 112 och Självmordslinjen ska aldrig gömmas bakom en sammanfattning, en
  kategorifiltrering, en följdfråga eller ett modellsvar.
- `AcuteStrip.astro` visas utan JavaScript och utan AI. Håll det så.
- Akuttexter och akutnummer ändras inte utan verifiering mot godkänd källa.
- Akutresultat ska vara deterministiskt och testbart — det måste fungera även
  när AI-leverantören ligger nere.

## Språk och etiketter

- Synlig text ska vara svensk och korrekt: å, ä och ö. Normaliserade sluggar
  (`sjalvmordstankar`, `rad-och-stod`) är interna nycklar för ID, URL och
  sökmatchning och får aldrig visas för en läsare. Visningstexten kommer från
  [`src/lib/labels.ts`](src/lib/labels.ts).
- Kalla inte myndigheter eller kunskapsorganisationer för stödlinjer när datan
  skiljer på dem (`metadata.supportLine: false`).
- Påstå inte att något är anonymt, kostnadsfritt eller öppet dygnet runt om det
  inte uttryckligen står i posten.

## Dubbletter

- Kontrollera vid nya poster om tjänsten redan finns. En organisation och dess
  stödlinje är **en** post, inte två — se Ätstörningslinjen / Frisk & Fri.
- En organisation som inte själv är en stödlinje kan ligga kvar som
  organisationsuppgift (`status: "retired"`, `metadata.supportLine: false`) utan
  att räknas som en egen linje.

## Integritet

- Användarens fritext får inte hamna i analytics, i vanliga produktionsloggar
  eller i felrapporter. Chattens felloggning skriver feltyp och status, aldrig
  meddelandeinnehåll — behåll den nivån.
- Skicka inte känslig användarkontext vidare till tredje part.

## Prompt-instruktioner bor på ett ställe

Säkerhets- och grundningsreglerna för modellen ligger i `CORE` i
[`src/lib/stodkompassen.ts`](src/lib/stodkompassen.ts). Duplicera dem inte i
enskilda routes — ändra dem där, så gäller de på alla ytor.

## Tester

- Kör `npm run test` vid ändringar i akutlogik, sökning, katalogschema eller
  AI-lagret. Testerna är deterministiska och gör inga betalda AI-anrop — håll
  dem så.
- Ändrar du `crisisDetect.ts`, `verifiedCatalog.ts` eller `supportLineSearch.ts`
  ska motsvarande testfall uppdateras i samma ändring.

## Arbetssätt

- Gör inga commits eller pushar utan uttrycklig instruktion.
- Node 24 LTS är målversionen (se `.nvmrc`).
