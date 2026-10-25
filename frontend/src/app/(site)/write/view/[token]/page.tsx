"use client";

import { useParams } from "next/navigation";
import { SharedView } from "@/components/WriteMore";

export default function Page() {
  const { token } = useParams<{ token: string }>();
  return <SharedView token={token} />;
}
