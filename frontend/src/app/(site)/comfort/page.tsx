import type { Metadata } from "next";
import { ComfortWizard } from "@/components/lux/ComfortWizard";

export const metadata: Metadata = { title: "אשף נוחות", description: "גודל טקסט, תנועה, ניגודיות, צבעים והקראה: מתאימים את האתר אליכם." };

export default function ComfortPage() {
  return <ComfortWizard />;
}
