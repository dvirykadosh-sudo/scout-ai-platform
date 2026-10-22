import { Suspense } from "react";
import { Generator } from "@/components/Generator";
import { HomeHero } from "@/components/HomeHero";
import { PageTitle, Skeleton } from "@/components/ui";
import { QuickStart } from "@/components/QuickStart";
import { AnnouncementsBanner } from "@/components/CommunityParts";
import { RemindersBanner } from "@/components/RemindersBanner";
import { ThisWeek } from "@/components/ThisWeek";

export default function HomePage() {
  return (
    <>
      <PageTitle lead="ממלאים כמה פרטים, בוחרים שיטות וזמנים, ומקבלים פעולה מלאה בחמישה שלבים שאפשר לייצא ל-Word.">יצירת פעולה חכמה</PageTitle>
      <HomeHero />
      <AnnouncementsBanner />
      <RemindersBanner />
      <ThisWeek />
      <Suspense fallback={<Skeleton lines={3} />}>
        <QuickStart />
      </Suspense>
      <Suspense fallback={<Skeleton lines={5} />}>
        <Generator />
      </Suspense>
    </>
  );
}
