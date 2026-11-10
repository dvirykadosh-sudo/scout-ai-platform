import type { Metadata } from "next";
import { ExportStudio } from "@/components/lux/ExportStudio";

export const metadata: Metadata = { title: "סטודיו ייצוא", description: "תצוגה חיה של מסמך Word, PDF, כרטיסים וכרזה, עם ערכות צבעים ולוגו שנגרר.", robots: { index: false, follow: false } };

export default function StudioPage() {
  return <ExportStudio />;
}
