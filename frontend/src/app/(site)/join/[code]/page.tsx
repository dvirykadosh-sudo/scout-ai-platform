import { PageTitle } from "@/components/ui";
import { JoinPage } from "@/components/AccountV52";

export const metadata = { title: "הצטרפות בהזמנה", robots: { index: false } };

export default async function Join({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <>
      <PageTitle>הצטרפות לשבט</PageTitle>
      <JoinPage code={code} />
    </>
  );
}
