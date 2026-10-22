import Link from "next/link";
import { KindGuide } from "@/components/KindGuide";
import { YearMix } from "@/components/YearMix";

export const metadata = { title: "סוגי פעולות" };

export default function Page() {
  return (
    <>
      <h1>סוגי פעולות</h1>
      <p className="lead">לא כל פעולה היא אותו דבר. הנה שבעת הסוגים, מה מיוחד בכל אחד, מתי כדאי ואיך הוא בנוי.</p>
      <p>
        <Link className="btn" href="/ideas">
          מאגר רעיונות לפעולת שיא
        </Link>
      </p>
      <KindGuide />
      <YearMix />
    </>
  );
}
