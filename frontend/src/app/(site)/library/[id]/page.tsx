import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActivityPage } from "@/components/ActivityPage";
import { INDEXING, describeActivity, loadActivity, siteUrl } from "@/lib/seo";

// שלב 55: תוכן הפעולה נטען בשרת, כך שהוא כבר בקוד העמוד שגוגל ורשתות חברתיות קוראים (ולא רק אחרי הרצת JavaScript).
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { status, data: a } = await loadActivity((await params).id);
  // 404 כבר כאן (ולא רק בגוף העמוד): כך גוגל מקבל קוד 404 אמיתי ולא "200 עם הודעת שגיאה".
  if (status === 404) notFound();
  if (!a) return {};
  const description = describeActivity(a);
  const ok = a.status === "PUBLISHED";
  return {
    title: a.title,
    description,
    openGraph: { type: "article", locale: "he_IL", siteName: "מחולל פעולות | שבט מעוז", title: a.title, description },
    twitter: { card: "summary_large_image", title: a.title, description },
    robots: INDEXING && ok ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { status, data: a } = await loadActivity((await params).id);
  if (status === 404) notFound();
  const base = siteUrl();
  const ld = INDEXING && a && a.status === "PUBLISHED" && [
    { "@context": "https://schema.org", "@type": "LearningResource", name: a.title, description: describeActivity(a), inLanguage: "he", educationalLevel: a.ageGroup, teaches: a.leadingValue, timeRequired: `PT${a.durationMin}M`, dateModified: a.updatedAt, datePublished: a.createdAt, url: `${base}/library/${a.id}`, provider: { "@type": "Organization", name: a.tribe || "שבט מעוז" } },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "מחולל פעולות", item: base }, { "@type": "ListItem", position: 2, name: "מאגר פעולות", item: `${base}/library` }, { "@type": "ListItem", position: 3, name: a.title, item: `${base}/library/${a.id}` }] },
  ];
  return (
    <>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />}
      <ActivityPage initial={a} />
    </>
  );
}
