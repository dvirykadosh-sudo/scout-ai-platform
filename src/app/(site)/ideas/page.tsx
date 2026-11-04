import { PeakIdeas } from "@/components/PeakIdeas";

export const metadata = { title: "רעיונות לפעולת שיא", description: "בנק רעיונות לפעולת שיא בשבט, לפי גיל וערך." };

export default function Page() {
  return (
    <>
      <h1>רעיונות לפעולת שיא</h1>
      <p className="lead">מחנה, טקס, משימה גדולה או משחק רחב. בוחרים רעיון, והאתר בונה ממנו פעולה שלמה בחמישה שלבים.</p>
      <PeakIdeas />
    </>
  );
}
