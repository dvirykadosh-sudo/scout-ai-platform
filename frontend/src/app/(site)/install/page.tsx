import { PageTitle } from "@/components/ui";
import { InstallGuide } from "@/components/SystemParts";

export const metadata = { title: "התקנה בטלפון", description: "איך מתקינים את מחולל הפעולות בטלפון כמו אפליקציה, כולל מצב לא מקוון." };

export default function Page() {
  return (
    <>
      <PageTitle lead="להוסיף את האתר למסך הבית, בלי חנות אפליקציות.">התקנה בטלפון</PageTitle>
      <InstallGuide />
    </>
  );
}
