import { HallPage } from "@/components/CommunityParts";

export const metadata = { title: "היכל התהילה" };

export default function Page() {
  return (
    <>
      <h1>היכל התהילה</h1>
      <p className="lead">מה עבד הכי טוב בשבט בחודש האחרון.</p>
      <HallPage />
    </>
  );
}
