import { PageTitle } from "@/components/ui";
import { WhatsNewPage } from "@/components/WriteFinal";

export const metadata = { title: "מה חדש באתר", description: "רשימת התכונות החדשות במחולל הפעולות ושינויים אחרונים, עם אפשרות להגיב על כל תכונה." };

export default function Page() {
  return (
    <>
      <PageTitle lead="מה השתנה בשדרוגים האחרונים. אפשר להגיב בלייק או דיסלייק על כל תכונה.">מה חדש באתר</PageTitle>
      <WhatsNewPage />
    </>
  );
}
