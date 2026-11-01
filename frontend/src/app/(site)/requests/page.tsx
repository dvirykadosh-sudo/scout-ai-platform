import { RequestsPage } from "@/components/CommunityParts";

export const metadata = { title: "בקשות לפעולות", description: "בקשו נושא לפעולה והצביעו על בקשות של מדריכים אחרים." };

export default function Page() {
  return (
    <>
      <h1>בקשות לפעולות</h1>
      <p className="lead">חסרה לכם פעולה בנושא מסוים? כתבו, ואחרים יכולים להצטרף לבקשה. הבקשות הפופולריות ביותר למעלה.</p>
      <RequestsPage />
    </>
  );
}
