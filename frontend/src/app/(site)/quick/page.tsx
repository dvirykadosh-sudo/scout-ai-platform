import { QuickPage } from "@/components/QuickPage";

export const metadata = { title: "מצב מהיר", description: "פעולה מוכנה תוך דקה: מצב מהיר למדריך שצריך פעולה עכשיו." };

export default function Page() {
  return (
    <>
      <h1>מצב מהיר</h1>
      <p className="lead">אין זמן להכין? בוחרים גיל וזמן, ומקבלים פעולה מוכנה בלחיצה אחת.</p>
      <QuickPage />
    </>
  );
}
