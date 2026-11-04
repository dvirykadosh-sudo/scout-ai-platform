import { Suspense } from "react";
import { HomeShell } from "@/components/HomeShell";
import { PageTitle } from "@/components/ui";

export default function HomePage() {
  return (
    <>
      <PageTitle lead="ממלאים כמה פרטים, בוחרים שיטות וזמנים, ומקבלים פעולה מלאה בחמישה שלבים שאפשר לייצא ל-Word.">יצירת פעולה חכמה</PageTitle>
      <Suspense fallback={null}>
        <HomeShell />
      </Suspense>
    </>
  );
}
