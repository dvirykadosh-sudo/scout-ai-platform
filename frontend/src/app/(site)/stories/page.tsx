import { StoriesPage } from "@/components/StoriesPage";

export const metadata = { title: "סיפורים ומשלים" };

export default function Page() {
  return (
    <>
      <h1>סיפורים ומשלים</h1>
      <p className="lead">סיפורים קצרים לקריאה בפעולה, מסודרים לפי ערך, עם שאלה לשיחה אחרי כל סיפור.</p>
      <StoriesPage />
    </>
  );
}
