import { Icebreakers } from "@/components/Icebreakers";

export const metadata = { title: "משחקי היכרות", description: "משחקי היכרות וקרח לשבט ולקבוצה חדשה, עם הוראות קצרות וציוד." };

export default function Page() {
  return (
    <>
      <h1>משחקי היכרות</h1>
      <p className="lead">צריכים פתיחה מהירה לקבוצה? כמה משחקים קצרים, אפשר לסנן לפי תנועה, ציוד וזמן, ולבקש עוד.</p>
      <Icebreakers />
    </>
  );
}
