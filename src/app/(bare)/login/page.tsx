import type { Metadata } from "next";
import { LampLogin } from "@/components/login/LampLogin";

export const metadata: Metadata = { title: "כניסה", robots: { index: false, follow: false } };

export default function Page() {
  return <LampLogin />;
}
