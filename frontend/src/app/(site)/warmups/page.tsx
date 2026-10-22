import { Warmups } from "@/components/Warmups";

export const metadata = { title: "חימום, מעברים ושקט" };

export default function Page() {
  return (
    <>
      <h1>חימום, מעברים ושקט</h1>
      <p className="lead">רעיונות קצרים לפתיחה, למעבר בין שלבים, לאיסוף הקבוצה ולסיום.</p>
      <Warmups />
    </>
  );
}
