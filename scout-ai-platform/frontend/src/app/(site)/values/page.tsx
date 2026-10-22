import { ValuesPage } from "@/components/ValuesPage";

export const metadata = { title: "פעולה לפי ערך" };

export default function Page() {
  return (
    <>
      <h1>פעולה לפי ערך</h1>
      <p className="lead">בוחרים ערך מהערכים של הצופים, ומקבלים פעולה מלאה בנושא שמתאים לו.</p>
      <ValuesPage />
    </>
  );
}
