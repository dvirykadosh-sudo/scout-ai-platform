import type { Metadata } from "next";
import { PresentMode } from "@/components/PresentMode";

export const metadata: Metadata = { title: "מצגת פעולה", description: "הצגת הפעולה במסך מלא, שלב אחרי שלב." };

export default function PresentPage() {
  return <PresentMode />;
}
