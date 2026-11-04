import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/Dashboard";

// עמוד אישי: לא לאינדוקס
export const metadata: Metadata = { title: "הלוח שלי", robots: { index: false, follow: false } };

export default function Page() {
  return <Dashboard />;
}
