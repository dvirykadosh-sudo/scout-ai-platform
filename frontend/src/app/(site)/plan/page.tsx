import { PlanPage } from "@/components/PlanPage";

export const metadata = { title: "תכנון תקופתי" };

export default function Page() {
  return (
    <>
      <h1>תכנון תקופתי</h1>
      <p className="lead">בוחרים כמה שבועות ומה הערכים שרוצים לכסות, והאתר מציע פעולה מהמאגר לכל שבוע ומראה אילו ערכים עדיין חסרים.</p>
      <PlanPage />
    </>
  );
}
