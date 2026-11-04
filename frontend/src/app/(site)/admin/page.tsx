import type { Metadata } from "next";
import { AdminPanel } from "@/components/AdminPanel";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "לוח בקרה לאדמין" };

export default function AdminPage() {
  return (
    <>
      <PageTitle>לוח בקרה לאדמין</PageTitle>
      <AdminPanel />
    </>
  );
}
