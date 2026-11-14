import type { MetadataRoute } from "next";
import { INDEXING, internalGet, siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

// כל הדפים הציבוריים. דפי עבודה (הדפסה, ייבוא, שיתוף מהטלפון), קישורים סודיים ודפים שמחייבים התחברות (/account, /write, /team) לא נכללים.
// שלב 66: מועד השינוי של הדפים הסטטיים הוא מועד הפריסה (העלייה האחרונה של השרת), ולא "עכשיו" בכל בקשה.
const DEPLOYED = new Date();
const PAGES: [string, number, MetadataRoute.Sitemap[number]["changeFrequency"]][] = [
  ["/", 1, "weekly"], ["/welcome", 0.8, "monthly"], ["/library", 0.9, "daily"], ["/types", 0.7, "monthly"], ["/values", 0.7, "monthly"], ["/methods", 0.7, "monthly"],
  ["/tools", 0.6, "monthly"], ["/ideas", 0.6, "monthly"], ["/warmups", 0.6, "monthly"], ["/icebreakers", 0.6, "monthly"], ["/stories", 0.6, "monthly"],
  ["/challenges", 0.6, "monthly"], ["/quick", 0.6, "monthly"], ["/plan", 0.5, "monthly"], ["/calendar", 0.4, "monthly"], ["/cupboard", 0.5, "monthly"],
  ["/story", 0.5, "monthly"], ["/chat", 0.4, "monthly"], ["/assistant", 0.5, "monthly"], ["/coverage", 0.5, "weekly"], ["/hall", 0.5, "weekly"],
  ["/new", 0.7, "monthly"], ["/help", 0.6, "monthly"], ["/install", 0.5, "monthly"], ["/whats-new", 0.5, "weekly"], ["/vote", 0.3, "monthly"],
  ["/requests", 0.3, "weekly"], ["/pilot", 0.3, "monthly"], ["/status", 0.2, "daily"], ["/accessibility", 0.5, "yearly"], ["/privacy", 0.5, "yearly"],
  ["/style-guide", 0.4, "monthly"],
];

// שלב 64: מפת האתר נבנית עד 100 קריאות API (5,000 פעולות), לכן נשמרת בזיכרון שעה (בלי זה כל סורק הפעיל אותן מחדש)
let cached: { at: number; data: MetadataRoute.Sitemap } | null = null;
const TTL_MS = 60 * 60_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!INDEXING) return [];
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;
  const data = await build();
  // תוצאה ריקה (למשל השרת עדיין עולה) לא נשמרת, כדי לא "לנעול" מפה חלקית
  if (data.length > PAGES.length) cached = { at: Date.now(), data };
  return data;
}

async function build(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const out: MetadataRoute.Sitemap = PAGES.map(([p, priority, changeFrequency]) => ({ url: `${base}${p === "/" ? "" : p}`, lastModified: DEPLOYED, changeFrequency, priority }));
  for (let page = 1; page <= 100; page++) {
    const r = await internalGet<{ items: { id: number; updatedAt: string }[]; total: number }>(`/api/activities?pageSize=50&page=${page}&sort=new`);
    if (!r.data?.items.length) break;
    for (const a of r.data.items) out.push({ url: `${base}/library/${a.id}`, lastModified: a.updatedAt, changeFrequency: "monthly", priority: 0.8 });
    if (page * 50 >= r.data.total) break;
  }
  return out;
}
