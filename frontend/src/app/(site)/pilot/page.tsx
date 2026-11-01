import { PageTitle } from "@/components/ui";
import { PilotPage } from "@/components/PilotParts";

export const metadata = { title: "פיילוט", description: "פיילוט מחולל הפעולות: מדריכים מנסים את האתר ושולחים משוב." };

export default function Page() {
  return (
    <>
      <PageTitle lead="מנסים את האתר, מתקדמים במשימות ואומרים לנו מה חסר.">פיילוט</PageTitle>
      <PilotPage />
    </>
  );
}
