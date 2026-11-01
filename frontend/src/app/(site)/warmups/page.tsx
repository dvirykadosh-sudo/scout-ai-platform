import { Warmups } from "@/components/Warmups";

export const metadata = { title: "חימום, מעברים ושקט", description: "משחקי חימום, מעברים ושקט להנחיית קבוצה: מביאים אנרגיה, עוברים בין שלבים ומחזירים סדר." };

export default function Page() {
  return (
    <>
      <h1>חימום, מעברים ושקט</h1>
      <p className="lead">רעיונות קצרים לפתיחה, למעבר בין שלבים, לאיסוף הקבוצה ולסיום.</p>
      <Warmups />
    </>
  );
}
