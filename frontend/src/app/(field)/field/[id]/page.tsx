import type { Metadata } from "next";
import { FieldMode } from "@/components/FieldMode";

export const metadata: Metadata = { title: "מצב הדרכה בשטח" };

export default function FieldPage() {
  return <FieldMode />;
}
