import type { Metadata } from "next";
import { Projector } from "@/components/lux/Projector";

export const metadata: Metadata = { title: "מצב מקרן", description: "הקרנה למפקדה: כותרות ענקיות, קוד QR לטלפון ומסך נקי." };

export default function ProjectorPage() {
  return <Projector />;
}
