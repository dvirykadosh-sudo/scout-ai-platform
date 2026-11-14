/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // שלב 63: לא מכריזים על הטכנולוגיה בכותרת X-Powered-By
  poweredByHeader: false,
  // לא ליצור קבצי AGENTS.md אוטומטית
  agentRules: false,
  // לפריסה ציבורית נבנה לתיקייה נפרדת (.next-prod) כדי לא להפריע לריצה המקומית
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // שלב 64: קבצים עם גרסה בשם (למשל logo-maoz-320.v1.webp) נשמרים בדפדפן שנה. כשמחליפים תמונה מעלים את מספר הגרסה בשם.
  async headers() {
    const year = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
    const week = [{ key: "Cache-Control", value: "public, max-age=604800" }];
    return [
      { source: "/logo-maoz-320.v1.webp", headers: year },
      { source: "/logo-maoz-640.v1.webp", headers: year },
      { source: "/icon-192.png", headers: week },
      { source: "/icon-512.png", headers: week },
      { source: "/icon-maskable-512.png", headers: week },
      { source: "/logo-maoz.png", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
    ];
  },
};
export default nextConfig;
