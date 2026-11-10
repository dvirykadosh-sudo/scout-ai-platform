import type { Metadata } from "next";
import { Wrapped } from "@/components/lux/Wrapped";

export const metadata: Metadata = { title: "סיכום השנה", description: "הסיפור של שנת הצופים שלכם: פעולות, ערכים ומתודות." };

export default function WrappedPage() {
  return <Wrapped />;
}
