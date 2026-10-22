import type { Metadata } from "next";
import { PresentMode } from "@/components/PresentMode";

export const metadata: Metadata = { title: "מצגת פעולה" };

export default function PresentPage() {
  return <PresentMode />;
}
