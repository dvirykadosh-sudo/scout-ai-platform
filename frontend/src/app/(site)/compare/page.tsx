import { PageTitle } from "@/components/ui";
import { ComparePage } from "@/components/Lab74More";

export const metadata = { title: "השוואה בין פעולות", description: "שתיים או שלוש פעולות זו לצד זו: משך, ציוד, בטיחות, איכות, דירוג ונגישות." };

export default function Page() {
  return (
    <>
      <PageTitle lead="שתיים או שלוש פעולות זו לצד זו, כדי לבחור מהר מה מתאים לקבוצה.">השוואה בין פעולות</PageTitle>
      <ComparePage />
    </>
  );
}
