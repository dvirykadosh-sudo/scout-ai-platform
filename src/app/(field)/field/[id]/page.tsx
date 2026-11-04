import type { Metadata } from "next";
import { FieldMode } from "@/components/FieldMode";

export const metadata: Metadata = { title: "מצב הדרכה בשטח", description: "מצב הדרכה בשטח: שלבים בגדול, טיימר והתראות." };

export default function FieldPage() {
  return <FieldMode />;
}
