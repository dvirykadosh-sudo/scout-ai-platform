import { Icebreakers } from "@/components/Icebreakers";

export const metadata = { title: "משחקי היכרות" };

export default function Page() {
  return (
    <>
      <h1>משחקי היכרות</h1>
      <p className="lead">צריכים פתיחה מהירה לקבוצה? כמה משחקים קצרים, אפשר לסנן לפי תנועה, ציוד וזמן, ולבקש עוד.</p>
      <Icebreakers />
    </>
  );
}
