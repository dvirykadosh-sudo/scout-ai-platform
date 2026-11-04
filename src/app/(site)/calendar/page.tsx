import { CalendarPage } from "@/components/CalendarPage";

export const metadata = { title: "יומן ותזכורות", description: "יומן פעולות ותזכורות למדריך, עם ייצוא ליומן הטלפון." };

export default function Page() {
  return (
    <>
      <h1>יומן ותזכורות</h1>
      <p className="lead">שיבוץ פעולות לתאריכים, תזכורת הכנה לפני כל פעולה, והורדה ליומן בטלפון.</p>
      <CalendarPage />
    </>
  );
}
