import type { MetadataRoute } from "next";
import { INDEXING, internalGet, siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

// כל הדפים הציבוריים. דפי עבודה (הדפסה, ייבוא, שיתוף מהטלפון) וקישורים סודיים לא נכללים.
const PAGES: [string, number, MetadataRoute.Sitemap[number]["changeFrequency"]][] = [
  ["/", 1, "weekly"], ["/library", 0.9, "daily"], ["/types", 0.7, "monthly"], ["/values", 0.7, "monthly"], ["/methods", 0.7, "monthly"],
  ["/tools", 0.6, "monthly"], ["/ideas", 0.6, "monthly"], ["/warmups", 0.6, "monthly"], ["/icebreakers", 0.6, "monthly"], ["/stories", 0.6, "monthly"],
  ["/challenges", 0.6, "monthly"], ["/quick", 0.6, "monthly"], ["/plan", 0.5, "monthly"], ["/calendar", 0.4, "monthly"], ["/cupboard", 0.5, "monthly"],
  ["/write", 0.6, "monthly"], ["/story", 0.5, "monthly"], ["/chat", 0.4, "monthly"], ["/assistant", 0.5, "monthly"], ["/coverage", 0.5, "weekly"], ["/hall", 0.5, "weekly"], ["/team", 0.4, "monthly"],
  ["/new", 0.7, "monthly"], ["/help", 0.6, "monthly"], ["/install", 0.5, "monthly"], ["/whats-new", 0.5, "weekly"], ["/vote", 0.3, "monthly"],
  ["/requests", 0.3, "weekly"], ["/pilot", 0.3, "monthly"], ["/status", 0.2, "daily"], ["/accessibility", 0.5, "yearly"], ["/privacy", 0.5, "yearly"],
  ["/style-guide", 0.4, "monthly"], ["/account", 0.2, "yearly"],
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!INDEXING) return [];
  const base = siteUrl();
  const out: MetadataRoute.Sitemap = PAGES.map(([p, priority, changeFrequency]) => ({ url: `${base}${p === "/" ? "" : p}`, changeFrequency, priority }));
  for (let page = 1; page <= 40; page++) {
    const r = await internalGet<{ items: { id: number; updatedAt: string }[]; total: number }>(`/api/activities?pageSize=50&page=${page}&sort=new`);
    if (!r.data?.items.length) break;
    for (const a of r.data.items) out.push({ url: `${base}/library/${a.id}`, lastModified: a.updatedAt, changeFrequency: "monthly", priority: 0.8 });
    if (page * 50 >= r.data.total) break;
  }
  return out;
}
