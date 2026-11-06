import { PageTitle } from "@/components/ui";
import { SeenMark } from "@/components/Discover54";
import { ChatHelper } from "@/components/Chat57";

export const metadata = { title: "עוזר שיחות", description: "נתחו שיחה עם חניך או עם השכבה: מה מחכה לתשובה, מצב רוח, סימני מצוקה, ומה לענות ואיך. בפרטיות, בלי לשמור את השיחה." };

export default function Page() {
  return (
    <>
      <PageTitle lead="העלו שיחה, וקבלו מה כדאי לענות ואיך, בלי לשמור שום דבר.">עוזר שיחות</PageTitle>
      <SeenMark id="chat" />
      <ChatHelper />
    </>
  );
}
