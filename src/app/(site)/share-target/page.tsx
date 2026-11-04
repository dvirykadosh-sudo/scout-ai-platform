import { PageTitle } from "@/components/ui";
import { ShareTargetPage } from "@/components/Pages54";

export const metadata = { title: "שיתוף לאתר", description: "קליטת טקסט שיתפתם מהטלפון ופירוקו לשלבי פעולה." };

export default function Page() {
  return (
    <>
      <PageTitle lead="שיתפתם טקסט מאפליקציה אחרת, למשל פעולה שקיבלתם בוואטסאפ. אפשר לפרק אותה לשלבים ולשמור.">שיתוף לאתר</PageTitle>
      <ShareTargetPage />
    </>
  );
}
