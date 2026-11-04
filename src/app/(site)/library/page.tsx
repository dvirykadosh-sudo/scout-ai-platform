import type { Metadata } from "next";
import { Library } from "@/components/Library";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "מאגר פעולות", description: "מאגר פעולות לצופים: חיפוש וסינון לפי גיל, ערך, מתודה ומשך, עם דירוגים והערות ממדריכים." };

export default function LibraryPage() {
  return (
    <>
      <PageTitle lead="כל הפעולות שנשמרו: אפשר לחפש, לסנן, לפתוח, לשכפל ולייצא ל-Word.">מאגר פעולות קיים</PageTitle>
      <Library />
    </>
  );
}
