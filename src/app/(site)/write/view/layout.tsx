import type { Metadata } from "next";

// קישור צפייה סודי בטיוטה: לא נכנס לחיפוש.
export const metadata: Metadata = { title: "טיוטה משותפת", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
