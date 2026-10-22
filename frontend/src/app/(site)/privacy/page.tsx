import type { Metadata } from "next";
import { PrivacyPage } from "@/components/PrivacyPage";

export const metadata: Metadata = { title: "פרטיות ותנאי שימוש" };

export default function Page() {
  return <PrivacyPage />;
}
