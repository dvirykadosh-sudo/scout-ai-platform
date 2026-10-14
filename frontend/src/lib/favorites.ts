"use client";

import { useCallback, useEffect, useState } from "react";
import { storageGet, storageSet } from "./api";

const KEY = "scout.favs";

function read(): number[] {
  const raw = storageGet(KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

/** מועדפים נשמרים בדפדפן של המדריך בלבד (לא בשרת). */
export function useFavorites() {
  const [ids, setIds] = useState<number[]>([]);

  useEffect(() => {
    setIds(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setIds(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback((id: number) => {
    setIds((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      storageSet(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { ids, isFav: (id: number) => ids.includes(id), toggle };
}
