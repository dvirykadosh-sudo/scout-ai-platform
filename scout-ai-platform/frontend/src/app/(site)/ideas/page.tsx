import { PeakIdeas } from "@/components/PeakIdeas";

export const metadata = { title: "רעיונות לפעולת שיא" };

export default function Page() {
  return (
    <>
      <h1>רעיונות לפעולת שיא</h1>
      <p className="lead">מחנה, טקס, משימה גדולה או משחק רחב. בוחרים רעיון, והאתר בונה ממנו פעולה שלמה בחמישה שלבים.</p>
      <PeakIdeas />
    </>
  );
}
