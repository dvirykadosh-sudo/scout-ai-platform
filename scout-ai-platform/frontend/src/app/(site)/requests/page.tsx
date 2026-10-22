import { RequestsPage } from "@/components/CommunityParts";

export const metadata = { title: "בקשות לפעולות" };

export default function Page() {
  return (
    <>
      <h1>בקשות לפעולות</h1>
      <p className="lead">חסרה לכם פעולה בנושא מסוים? כתבו, ואחרים יכולים להצטרף לבקשה. הבקשות הפופולריות ביותר למעלה.</p>
      <RequestsPage />
    </>
  );
}
