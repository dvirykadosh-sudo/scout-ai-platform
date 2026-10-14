import { Suspense } from "react";
import { Generator } from "@/components/Generator";
import { HomeHero } from "@/components/HomeHero";
import { PageTitle, Skeleton } from "@/components/ui";

export default function HomePage() {
  return (
    <>
      <PageTitle lead="ממלאים כמה פרטים, בוחרים שיטות וזמנים, ומקבלים פעולה מלאה בחמישה שלבים שאפשר לייצא ל-Word.">יצירת פעולה חכמה</PageTitle>
      <HomeHero />
      <Suspense fallback={<Skeleton lines={5} />}>
        <Generator />
      </Suspense>
    </>
  );
}
