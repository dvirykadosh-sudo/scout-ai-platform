import { HelpCenter } from "@/components/HelpCenter";

export const metadata = { title: "עזרה ושאלות נפוצות" };

export default function Page() {
  return (
    <>
      <h1>עזרה ושאלות נפוצות</h1>
      <p className="lead">תשובות קצרות. אפשר לחפש לפי מילה.</p>
      <HelpCenter />
    </>
  );
}
