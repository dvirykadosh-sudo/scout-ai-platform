import type { MetadataRoute } from "next";
import { INDEXING, PRIVATE_PATHS, siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

// כל האתר פתוח לסריקה, חוץ מקישורים סודיים ולוח הבקרה. ALLOW_INDEXING=0 סוגר את הכול למנועי חיפוש,
// ומשאיר רק בוטים של תצוגה מקדימה (וואטסאפ וכו') לקרוא דפי פעולה.
const PREVIEW_BOTS = ["WhatsApp", "facebookexternalhit", "Twitterbot", "TelegramBot", "Slackbot", "LinkedInBot", "Discordbot"];

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  if (INDEXING) return { rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }], sitemap: `${base}/sitemap.xml`, host: base };
  return { rules: [{ userAgent: PREVIEW_BOTS, allow: ["/library/"], disallow: PRIVATE_PATHS }, { userAgent: "*", disallow: "/" }] };
}
