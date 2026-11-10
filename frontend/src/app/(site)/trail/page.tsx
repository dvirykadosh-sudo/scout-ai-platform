import type { Metadata } from "next";
import { TrailMap } from "@/components/lux/TrailMap";

export const metadata: Metadata = { title: "מפת שביל השנה", description: "תכנון שנתי כמסע: חגים, מחנות, טקסים והפעולות שלכם כתחנות על שביל." };

export default function TrailPage() {
  return <TrailMap />;
}
