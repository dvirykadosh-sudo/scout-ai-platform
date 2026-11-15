"use client";

// שלב 67: מנהרת הכרטיסים בתחתית עמוד הבית. נטענת אחרי שהדף עלה (dynamic), ומציגה את ארבע הפעולות המדורגות ביותר.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Activity, ListResponse } from "@/lib/types";
import { CardTunnel } from "./CardTunnel";

export function HomeTunnel() {
  const [items, setItems] = useState<Activity[]>([]);
  useEffect(() => {
    api<ListResponse>("/api/activities?sort=rating&pageSize=4")
      .then((d) => setItems(d.items))
      .catch(() => {});
  }, []);
  return <CardTunnel items={items} />;
}
