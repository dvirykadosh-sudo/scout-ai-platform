import { ImportFiles } from "@/components/ImportFiles";

export const metadata = { title: "ייבוא פעולות מקבצים", description: "ייבוא פעולות מקובצי Word וטקסט אל מאגר הפעולות." };

export default function Page() {
  return (
    <>
      <h1>ייבוא פעולות מקבצי Word</h1>
      <p className="lead">יש לכם פעולות ישנות בקבצים? בוחרים כמה קבצים (docx או txt), והאתר מזהה את השלבים, הזמנים והציוד ומכניס אותם למאגר. לפני השמירה אפשר לתקן כל פרט.</p>
      <ImportFiles />
    </>
  );
}
