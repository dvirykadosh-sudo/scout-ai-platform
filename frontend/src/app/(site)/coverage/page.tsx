import { PageTitle } from "@/components/ui";
import { CoveragePage } from "@/components/Pages54";

export const metadata = { title: "מפת כיסוי המאגר", description: "לכל ערך ולכל כיתה: כמה פעולות יש במאגר, ואילו פערים כדאי למלא." };

export default function Page() {
  return (
    <>
      <PageTitle lead="לכל ערך ולכל כיתה: כמה פעולות יש במאגר, ואילו פערים כדאי למלא.">מפת כיסוי המאגר</PageTitle>
      <CoveragePage />
    </>
  );
}
