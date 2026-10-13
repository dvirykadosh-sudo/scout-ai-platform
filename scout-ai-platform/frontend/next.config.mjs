/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // לא ליצור קבצי AGENTS.md אוטומטית
  agentRules: false,
  // לפריסה ציבורית נבנה לתיקייה נפרדת (.next-prod) כדי לא להפריע לריצה המקומית
  distDir: process.env.NEXT_DIST_DIR || ".next",
};
export default nextConfig;
