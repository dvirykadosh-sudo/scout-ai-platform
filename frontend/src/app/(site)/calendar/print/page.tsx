import { PrintWeek } from "@/components/CommunityParts";

export const metadata = { title: "השבוע שלי להדפסה" };

export default function Page() {
  return (
    <>
      <h1>השבוע שלי</h1>
      <PrintWeek />
    </>
  );
}
