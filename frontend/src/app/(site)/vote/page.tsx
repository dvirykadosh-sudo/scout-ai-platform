import { PageTitle } from "@/components/ui";
import { VotePage } from "@/components/PilotParts";

export const metadata = { title: "מה לבנות הבא" };

export default function Page() {
  return (
    <>
      <PageTitle lead="מציעים רעיון ומצביעים. מה שמקבל הכי הרבה קולות נבנה ראשון.">מה לבנות הבא</PageTitle>
      <VotePage />
    </>
  );
}
