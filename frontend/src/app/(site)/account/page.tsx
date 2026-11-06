import type { Metadata } from "next";
import { AccountPanel } from "@/components/AccountPanel";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "האזור האישי", description: "האזור האישי של המדריך: הפעולות שלי, המועדפים, יומן ההפעלות והגדרות אבטחה." };

export default function AccountPage() {
  return (
    <>
      <PageTitle lead="הפעולות והסגנון שלכם, שמורים בחשבון ונגישים מכל מכשיר.">האזור האישי</PageTitle>
      <AccountPanel />
    </>
  );
}
