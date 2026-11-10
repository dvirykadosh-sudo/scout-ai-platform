"use client";

// שלב 61 (רעיון 18): נוכחות חיה בטיוטה משותפת. סקר קצר כל כמה שניות (לא חיבור פתוח), נעצר כשהלשונית מוסתרת.
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export interface Person {
  id: string;
  name: string;
  owner: boolean;
  typing: boolean;
  color: string;
  you: boolean;
}
interface Beat {
  people: Person[];
  commentCount: number;
  updatedAt: string;
  shared?: boolean;
}
export interface PresenceState {
  people: Person[];
  ended: boolean;
}

const newCid = () => {
  try {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  } catch {
    return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  }
};

/** url: נתיב ה-POST (null = כבוי). onChange נקרא כשמספר התגובות או זמן העדכון של הטיוטה השתנו מאז הסקר הקודם. */
export function usePresence({ url, token, name, typing, onChange }: { url: string | null; token?: string | null; name?: string; typing?: boolean; onChange?: () => void }): PresenceState {
  const [state, setState] = useState<PresenceState>({ people: [], ended: false });
  const cid = useRef("");
  const last = useRef<{ c: number; u: string } | null>(null);
  const typingRef = useRef(!!typing);
  const nameRef = useRef(name);
  const cb = useRef(onChange);
  const kick = useRef<() => void>(() => {});
  cb.current = onChange;
  nameRef.current = name;

  useEffect(() => {
    typingRef.current = !!typing;
    kick.current(); // שינוי במצב ההקלדה נשלח מיד, כדי שהאחרים יראו את החיווי בלי להמתין לסקר הבא
  }, [typing]);

  useEffect(() => {
    if (!url) {
      setState({ people: [], ended: false });
      return;
    }
    if (!cid.current) cid.current = newCid();
    let stop = false;
    let timer = 0;
    let inflight = false;
    const every = () => (document.documentElement.classList.contains("saver") ? 20_000 : 8_000);
    const beat = async () => {
      if (stop || inflight || document.visibilityState === "hidden") return;
      inflight = true;
      try {
        const r = await api<Beat>(url, { method: "POST", token: token ?? null, body: { cid: cid.current, name: nameRef.current || undefined, typing: typingRef.current } });
        if (stop) return;
        setState({ people: r.people, ended: false });
        const prev = last.current;
        last.current = { c: r.commentCount, u: r.updatedAt };
        if (prev && (prev.c !== r.commentCount || prev.u !== r.updatedAt)) cb.current?.();
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 404) {
          stop = true;
          setState({ people: [], ended: true });
        }
      } finally {
        inflight = false;
      }
    };
    kick.current = () => void beat();
    const loop = () => {
      void beat();
      timer = window.setTimeout(loop, every());
    };
    loop();
    const vis = () => document.visibilityState === "visible" && void beat();
    document.addEventListener("visibilitychange", vis);
    return () => {
      stop = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", vis);
      kick.current = () => {};
    };
  }, [url, token]);

  return state;
}
