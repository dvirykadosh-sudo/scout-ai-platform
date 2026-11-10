import type { Metadata } from "next";
import { Insights } from "@/components/lux/Insights";

export const metadata: Metadata = { title: "תובנות ומגמות", description: "מפת חום, ערכים ומתודות: מה עשיתם השנה, במבט אחד." };

export default function InsightsPage() {
  return <Insights />;
}
