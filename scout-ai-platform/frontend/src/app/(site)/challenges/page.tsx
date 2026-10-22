import { ChallengesPage } from "@/components/ChallengesPage";

export const metadata = { title: "אתגרי חינוך" };

export default function Page() {
  return (
    <>
      <h1>אתגרי חינוך</h1>
      <p className="lead">מצב אמיתי בקבוצה? בוחרים אותו, ומקבלים פעולה שמתאימה, עם הערה איך לטפל בו בזהירות.</p>
      <ChallengesPage />
    </>
  );
}
