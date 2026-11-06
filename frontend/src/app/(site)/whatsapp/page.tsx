import type { Metadata } from "next";
import { WhatsAppCenter } from "@/components/whatsapp/WhatsAppCenter";

export const metadata: Metadata = {
  title: "מרכז הוואטסאפ",
  description: "ניהול הודעות, תזכורות ואישורי הגעה בוואטסאפ (מנהל ראשי בלבד).",
  robots: { index: false, follow: false },
};

export default function WhatsAppPage() {
  return <WhatsAppCenter />;
}
