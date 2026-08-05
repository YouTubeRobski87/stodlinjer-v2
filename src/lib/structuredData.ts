export const SITE_URL = "https://www.stodlinjer.se";
export const SITE_NAME = "Stödlinjer";

export function absoluteUrl(path = "/"): string {
  return new URL(path, SITE_URL).href;
}

export function siteOrganization(): Record<string, unknown> {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: absoluteUrl(),
  };
}

export function breadcrumbList(
  items: Array<{ name: string; path: string }>,
): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
