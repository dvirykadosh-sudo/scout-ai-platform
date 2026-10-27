import { PageTitle } from "@/components/ui";
import { TeamPage } from "@/components/TeamPage";

export const metadata = { title: "לוח צוות" };

export default function Page() {
  return (
    <>
      <PageTitle lead="מי מעביר איזו פעולה ומתי. אפשר לבקש מחליף בלחיצה.">לוח צוות</PageTitle>
      <TeamPage />
    </>
  );
}
