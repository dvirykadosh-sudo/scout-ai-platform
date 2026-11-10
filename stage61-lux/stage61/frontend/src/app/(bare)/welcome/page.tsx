import type { Metadata } from "next";
import { Welcome } from "@/components/lux/Welcome";

const DESC = "מחולל פעולות לשבט מעוז: פעולה שלמה בחמישה שלבים, מאגר פעולות, מצב במה בשטח, סטודיו ייצוא, מפת שביל השנה ותובנות. הכול בעברית ונגיש.";
export const metadata: Metadata = {
  title: "ברוכים הבאים",
  description: DESC,
  alternates: { canonical: "/welcome" },
  openGraph: { title: "מחולל פעולות | שבט מעוז", description: DESC, type: "website", locale: "he_IL" },
};

export default function WelcomePage() {
  return <Welcome />;
}
