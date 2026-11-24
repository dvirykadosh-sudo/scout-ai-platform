"use client";

// שלב 70: חיבור חי (SSE) למסמך בעורך: מי מחובר, באיזה שלב הוא נמצא, והודעות "המסמך נשמר" משאר המחוברים.
// עובד עם fetch+ReadableStream (כמו חדרי השטח) כדי לשלוח כותרת התחברות. מתחבר מחדש לבד עם אותו מזהה, גם אחרי שהשרת נרדם.
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, api } from "./api";
import { parseSse } from "./field";

export interface LivePerson {
  id: string;
  name: string;
  owner: boolean;
  block: string | null;
  editing: boolean;
  color: string;
  /** שלב 75: השלב שהאדם הזה נועל כרגע לעריכה (מייעץ בלבד), או null */
  lock?: string | null;
}
export interface SavedEvent {
  rev: number;
  by: string | null;
  changed: string[];
  title: boolean;
  meta: boolean;
  conflicts: string[];
}
export type LiveState = "off" | "connecting" | "live";

const newCid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");

export function useTeamLive({ docId, token, enabled, onSaved }: { docId: number; token: string | null; enabled: boolean; onSaved: (e: SavedEvent) => void }) {
  const [people, setPeople] = useState<LivePerson[]>([]);
  const [me, setMe] = useState("");
  const [state, setState] = useState<LiveState>("off");
  const cid = useRef("");
  const savedRef = useRef(onSaved);
  savedRef.current = onSaved;
  const lastFocus = useRef<{ block: string | null; editing: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled || !token) {
      setState("off");
      setPeople([]);
      return;
    }
    if (!cid.current) cid.current = newCid();
    const ac = new AbortController();
    setState("connecting");
    void (async () => {
      let wait = 1500;
      while (!ac.signal.aborted) {
        try {
          const res = await fetch(`${API_URL}/api/write/docs/${docId}/live?cid=${cid.current}`, { headers: { Accept: "text/event-stream", Authorization: `Bearer ${token}` }, signal: ac.signal, cache: "no-store" });
          if (res.status === 404 || res.status === 409 || res.status === 401) {
            setState("off"); // אין הרשאה, או החדר מלא: לא מנסים שוב ושוב
            return;
          }
          if (!res.ok || !res.body) throw new Error(`http ${res.status}`);
          wait = 1500;
          lastFocus.current = null; // אחרי חיבור מחדש השרת לא זוכר היכן הייתי
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const parsed = parseSse(buf);
            buf = parsed.rest;
            for (const m of parsed.messages) {
              let d: { me?: string; people?: LivePerson[] } & Partial<SavedEvent>;
              try {
                d = JSON.parse(m.data);
              } catch {
                continue;
              }
              if (m.event === "hello") {
                setMe(d.me ?? "");
                setPeople(d.people ?? []);
                setState("live");
              } else if (m.event === "presence") setPeople(d.people ?? []);
              else if (m.event === "saved" && typeof d.rev === "number") savedRef.current({ rev: d.rev, by: d.by ?? null, changed: d.changed ?? [], title: !!d.title, meta: !!d.meta, conflicts: d.conflicts ?? [] });
              else if (m.event === "kicked") {
                setState("off");
                ac.abort();
                return;
              }
            }
          }
        } catch {
          if (ac.signal.aborted) return;
        }
        if (ac.signal.aborted) return;
        setState("connecting");
        await new Promise((r) => window.setTimeout(r, wait));
        wait = Math.min(wait * 2, 10_000);
      }
    })();
    return () => {
      ac.abort();
      setPeople([]);
      setState("off");
    };
  }, [docId, token, enabled]);

  /** מדווח היכן אני נמצא ואם אני מקליד. מצטבר: לכל היותר בקשה אחת כל 1.2 שניות. */
  const focus = useCallback(
    (block: string | null, editing = false) => {
      if (!enabled || !token || !cid.current) return;
      const prev = lastFocus.current;
      if (prev && prev.block === block && prev.editing === editing) return;
      lastFocus.current = { block, editing };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const f = lastFocus.current;
        if (!f) return;
        void api(`/api/write/docs/${docId}/live/focus`, { method: "POST", token, body: { cid: cid.current, block: f.block, editing: f.editing } }).catch(() => {});
      }, 1200);
    },
    [docId, token, enabled],
  );

  return { people, me, state, cid: cid.current, focus, getCid: () => cid.current };
}
