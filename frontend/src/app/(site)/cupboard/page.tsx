import { CupboardPage } from "@/components/CupboardPage";

export const metadata = { title: "מה יש בארון" };

export default function Page() {
  return (
    <>
      <h1>מה יש בארון</h1>
      <p className="lead">מסמנים איזה ציוד יש במועדון, ורואים אילו פעולות אפשר להפעיל מיד, ומה כדאי להשיג.</p>
      <CupboardPage />
    </>
  );
}
