import type { Metadata } from "next";
import { PrivacyPage } from "@/components/PrivacyPage";

export const metadata: Metadata = { title: "פרטיות ותנאי שימוש", description: "מדיניות הפרטיות ותנאי השימוש של מחולל הפעולות: אילו נתונים נשמרים ולמה." };

export default function Page() {
  return <PrivacyPage />;
}
