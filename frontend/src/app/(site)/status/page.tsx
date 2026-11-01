import { PageTitle } from "@/components/ui";
import { StatusPage } from "@/components/Pages54";

export const metadata = { title: "מצב האתר", description: "בדיקה מהירה שהכול עובד: זמן פעילות, מסד נתונים וגיבוי אחרון." };

export default function Page() {
  return (
    <>
      <PageTitle lead="בדיקה מהירה שהכול עובד: זמן פעילות, מסד נתונים וגיבוי אחרון.">מצב האתר</PageTitle>
      <StatusPage />
    </>
  );
}
