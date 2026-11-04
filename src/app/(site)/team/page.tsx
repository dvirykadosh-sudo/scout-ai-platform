import { PageTitle } from "@/components/ui";
import { TeamPage } from "@/components/TeamPage";

export const metadata = { title: "לוח צוות", description: "לוח משימות ותיאום לצוות ההדרכה של שבט מעוז: מי מעביר מה ומתי." };

export default function Page() {
  return (
    <>
      <PageTitle lead="מי מעביר איזו פעולה ומתי. אפשר לבקש מחליף בלחיצה.">לוח צוות</PageTitle>
      <TeamPage />
    </>
  );
}
