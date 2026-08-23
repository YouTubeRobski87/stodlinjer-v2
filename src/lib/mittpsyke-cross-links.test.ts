// Regression checks for the six editorial cross-links to MittPsyke.
// Run: node --experimental-strip-types src/lib/mittpsyke-cross-links.test.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface CrossLinkCase {
  file: string;
  heading: string;
  copy: string;
  href: string;
  linkText: string;
}

const CASES: CrossLinkCase[] = [
  {
    file: "src/content/articles/forsta-ditt-maende/vad-ar-egentligen-angest.md",
    heading: "Vill du förstå mer om ångest?",
    copy: "På MittPsyke finns guider om oro, kroppens reaktioner och små sätt att hantera ångest i vardagen.",
    href: "https://www.mittpsyke.se/guider/angest",
    linkText: "Fördjupa dig om ångest i vardagen",
  },
  {
    file: "src/content/articles/forsta-ditt-maende/nedstamd-eller-deprimerad.md",
    heading: "Vill du läsa vidare?",
    copy: "På MittPsyke finns guider om nedstämdhet, låg ork och små steg i vardagen.",
    href: "https://www.mittpsyke.se/guider/depression",
    linkText: "Läs mer om nedstämdhet och små steg",
  },
  {
    file: "src/content/articles/forsta-ditt-maende/ar-jag-stressad-eller-utbrand.md",
    heading: "Vill du förstå stressen bättre?",
    copy: "På MittPsyke finns guider om belastning, återhämtning och hur stress kan märkas i vardagen.",
    href: "https://www.mittpsyke.se/guider/stress",
    linkText: "Förstå stress och återhämtning i vardagen",
  },
  {
    file: "src/content/articles/verktyg-och-sjalvhjalp/att-skriva-av-sig.md",
    heading: "Vill du skriva för dig själv?",
    copy: "På MittPsyke kan du börja skriva utan att först skapa konto.",
    href: "https://www.mittpsyke.se/anonym-dagbok-online",
    linkText: "Öppna den anonyma dagboken",
  },
  {
    file: "src/content/articles/forsta-ditt-maende/den-vara-oron-som-alltid-finns-dar.md",
    heading: "Vill du förstå oron lite mer?",
    copy: "På MittPsyke kan du läsa vidare om återkommande oro, grubblande och små sätt att skapa mer lugn i vardagen.",
    href: "https://www.mittpsyke.se/hjalp-mot-oro-online",
    linkText: "Läs mer om oro och grubblande",
  },
  {
    file: "src/content/articles/verktyg-och-sjalvhjalp/nar-tankarna-snurrar-pa-natten.md",
    heading: "Blir oron starkare på kvällen?",
    copy: "På MittPsyke finns en guide om kvällsångest, varför tankarna kan ta mer plats när dagen blir tystare och vad som kan hjälpa dig att landa.",
    href: "https://www.mittpsyke.se/guider/angest/angest-pa-kvallen",
    linkText: "Läs om kvällsångest",
  },
];

const failures: string[] = [];

for (const testCase of CASES) {
  const source = readFileSync(resolve(testCase.file), "utf8");
  const link = `<a href="${testCase.href}" target="_blank" rel="noopener noreferrer">${testCase.linkText}</a>`;

  for (const expected of [`## ${testCase.heading}`, testCase.copy, link]) {
    if (!source.includes(expected)) {
      failures.push(`${testCase.file}: saknar ${expected}`);
    }
  }

  const mittPsykeLinks = source.match(/<a href="https:\/\/[^\"]*mittpsyke\.se[^\"]*"[^>]*>/g) ?? [];
  if (mittPsykeLinks.length !== 1) {
    failures.push(`${testCase.file}: förväntade exakt en MittPsyke-länk, fick ${mittPsykeLinks.length}`);
  }

  for (const foundLink of mittPsykeLinks) {
    if (foundLink.includes("https://mittpsyke.se")) {
      failures.push(`${testCase.file}: använder apex-domänen i stället för www`);
    }
    if (/utm_|nofollow/i.test(foundLink)) {
      failures.push(`${testCase.file}: MittPsyke-länken innehåller otillåten UTM-parameter eller nofollow`);
    }
  }
}

if (failures.length) {
  console.error(`\nMittPsyke cross-link regression checks: ${failures.length} failed\n`);
  console.error(failures.map((failure) => `  ✗ ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`\nMittPsyke cross-link regression checks: ${CASES.length} passed\n`);
