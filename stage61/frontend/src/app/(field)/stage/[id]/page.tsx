import type { Metadata } from "next";
import { StageMode } from "@/components/lux/StageMode";

export const metadata: Metadata = { title: "מצב במה", description: "מצב הרצה במסך מלא: שלב אחד בכל פעם, טיימר ענק והחלקה בין שלבים." };

export default function StagePage() {
  return <StageMode />;
}
