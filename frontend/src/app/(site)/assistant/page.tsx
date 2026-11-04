import { AssistantPage } from "@/components/AssistantPage";

export const metadata = { title: "עוזר כתיבה אישי" };

export default function Page() {
  return (
    <>
      <h1 className="no-print">עוזר כתיבה אישי</h1>
      <p className="lead no-print">כותבים את הפעולה איך שנוח, והעוזר מסדר לכותרת, שלבים ושיטות, מראה מה חסר, ועוזר כשנתקעים.</p>
      <AssistantPage />
    </>
  );
}
