"use client";

// שלב 75: ווים של עורך הכתיבה שהופרדו מהקובץ הגדול. כולם מקבלים נתונים בפרמטרים ולא תלויים בעורך עצמו.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { api } from "@/lib/api";
import type { LivePerson } from "@/lib/useTeamLive";
import { HIST_GAP_MS, dropIndex, dropTarget, histList, histParse, histRecord, histRedo, histRestore, histTrim, histUndo, moveAnnounce, type HistEntry, type HistState } from "@/lib/write75";
import type { Block } from "./WriteParts";

/**
 * אובייקט פעולות עם זהות קבועה: מי שמקבל אותו כ-prop לא יוצא מ-React.memo בגלל שהעורך רונדר מחדש בכל הקלדה.
 * כל פעולה קוראת תמיד לנוסח האחרון של הפונקציה, כך שאין סגירות ישנות.
 */
export function useStableApi<T extends object>(impl: T): T {
  const ref = useRef(impl);
  ref.current = impl;
  return useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(impl)) out[k] = (...a: unknown[]) => (ref.current as Record<string, (...x: unknown[]) => unknown>)[k](...a);
    return out as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** נתונים שמתעדכנים בכל הקלדה אך נקראים רק בלחיצה: שומרים בערך ולא גורמים לרינדור */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/* ───────────── היסטוריית ביטול מקומית לכל שלב (שלב 75, פריט 1) ───────────── */

export interface BlockHistoryApi {
  /** מבטל בשלב. מחזיר false כשאין מה לבטל (אז אפשר לעבור לביטול הכללי) */
  undo: (id: string) => boolean;
  redo: (id: string) => boolean;
  list: (id: string) => HistEntry[];
  restore: (id: string, index: number) => boolean;
  canUndo: (id: string) => boolean;
  /** עולה בכל שינוי בהיסטוריה, כדי שחלונות פתוחים ירעננו */
  version: number;
}

export function useBlockHistory(docId: number, blocks: Block[], apply: (id: string, v: { title: string; text: string }) => void): BlockHistoryApi {
  const key = `scout.write.hist.${docId}`;
  const hist = useRef<HistState>({});
  const prev = useRef<Map<string, Block>>(new Map());
  const loaded = useRef(false);
  const saveT = useRef<number | undefined>(undefined);
  const [version, setVersion] = useState(0);
  const bl = useLatest(blocks);
  const ap = useLatest(apply);

  const persist = useCallback(() => {
    window.clearTimeout(saveT.current);
    try {
      localStorage.setItem(key, JSON.stringify(histTrim(hist.current, bl.current.map((b) => b.id))));
    } catch {
      /* אין מקום או אחסון חסום: ההיסטוריה נשארת בזיכרון */
    }
  }, [key, bl]);

  // רושמים רק שלבים שהזהות שלהם השתנתה: הקלדה בשלב אחד לא עוברת על כל המסמך
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      try {
        hist.current = histParse(localStorage.getItem(key));
      } catch {
        hist.current = {};
      }
    }
    const now = Date.now();
    let changed = false;
    const next = new Map<string, Block>();
    for (const b of blocks) {
      next.set(b.id, b);
      if (prev.current.get(b.id) !== b) {
        hist.current = histRecord(hist.current, b.id, { title: b.title, text: b.text }, now);
        changed = true;
      }
    }
    prev.current = next;
    if (changed) {
      window.clearTimeout(saveT.current);
      saveT.current = window.setTimeout(persist, 2500);
    }
  }, [blocks, key, persist]);

  useEffect(() => {
    const out = () => persist();
    window.addEventListener("pagehide", out);
    return () => {
      window.removeEventListener("pagehide", out);
      persist();
    };
  }, [persist]);

  return useMemo<BlockHistoryApi>(() => {
    const cur = (id: string) => bl.current.find((b) => b.id === id);
    const run = (id: string, fn: typeof histUndo) => {
      const b = cur(id);
      if (!b) return false;
      const r = fn(hist.current, id, { title: b.title, text: b.text }, Date.now());
      hist.current = r.state;
      if (!r.apply) return false;
      ap.current(id, r.apply);
      setVersion((v) => v + 1);
      return true;
    };
    return {
      undo: (id) => run(id, histUndo),
      redo: (id) => run(id, histRedo),
      list: (id) => histList(hist.current, id),
      canUndo: (id) => (hist.current[id]?.stack.length ?? 0) > 0,
      restore: (id, index) => {
        const b = cur(id);
        if (!b) return false;
        const r = histRestore(hist.current, id, index, { title: b.title, text: b.text }, Date.now());
        hist.current = r.state;
        if (!r.apply) return false;
        ap.current(id, r.apply);
        setVersion((v) => v + 1);
        return true;
      },
      version,
    };
  }, [version, bl, ap]);
}
export { HIST_GAP_MS };

/* ───────────── שינוי סדר: גרירה במצביע (עכבר, מגע, עט) ומקלדת נגישה (פריט 6) ───────────── */

export interface ReorderApi {
  /** משבצת ההכנסה הנוכחית בזמן גרירה (0 עד n), או null */
  drop: number | null;
  /** האינדקס שנגרר כעת בעכבר או במגע */
  dragging: number | null;
  /** השלב שנבחר להזזה במקלדת */
  held: string | null;
  /** הודעה לקורא מסך */
  message: string;
  grab: (idx: number, e: React.PointerEvent<HTMLElement>) => void;
  keyGrab: (idx: number, e: React.KeyboardEvent<HTMLElement>) => void;
  release: () => void;
}

export function useReorder(blocks: Block[], listRef: RefObject<HTMLElement | null>, move: (from: number, to: number) => void): ReorderApi {
  const [drop, setDrop] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [held, setHeld] = useState<{ id: string; orig: number } | null>(null);
  const [message, setMessage] = useState("");
  const bl = useLatest(blocks);
  const mv = useLatest(move);
  const heldRef = useLatest(held);

  const grab = useCallback(
    (idx: number, e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const el = e.currentTarget;
      const pid = e.pointerId;
      try {
        el.setPointerCapture(pid);
      } catch {
        /* לא קריטי */
      }
      e.preventDefault();
      const startY = e.clientY;
      let lastY = startY;
      let moved = false;
      let slot: number | null = null;
      let raf = 0;
      const slotAt = (y: number) => {
        const ol = listRef.current;
        if (!ol) return null;
        const rects = Array.from(ol.children).map((c) => {
          const r = c.getBoundingClientRect();
          return { top: r.top, height: r.height };
        });
        return dropIndex(rects, y);
      };
      const tick = () => {
        if (!moved) return;
        let scrolled = false;
        if (lastY < 90) {
          window.scrollBy(0, -16);
          scrolled = true;
        } else if (lastY > window.innerHeight - 90) {
          window.scrollBy(0, 16);
          scrolled = true;
        }
        if (scrolled) {
          slot = slotAt(lastY);
          setDrop(slot);
        }
        raf = window.requestAnimationFrame(tick);
      };
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        lastY = ev.clientY;
        if (!moved) {
          if (Math.abs(ev.clientY - startY) < 6) return;
          moved = true;
          setDragging(idx);
          document.body.classList.add("is-reordering");
          raf = window.requestAnimationFrame(tick);
        }
        slot = slotAt(ev.clientY);
        setDrop(slot);
      };
      const cleanup = () => {
        window.cancelAnimationFrame(raf);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onCancel);
        document.body.classList.remove("is-reordering");
        setDrop(null);
        setDragging(null);
      };
      const finish = (cancel: boolean) => {
        cleanup();
        if (!moved || cancel || slot === null) return;
        const list = bl.current;
        const to = dropTarget(idx, slot, list.length);
        if (to === idx) return;
        mv.current(idx, to);
        setMessage(moveAnnounce(list[idx]?.title ?? "", idx, to, list.length));
      };
      const onUp = (ev: PointerEvent) => ev.pointerId === pid && finish(false);
      const onCancel = (ev: PointerEvent) => ev.pointerId === pid && finish(true);
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onCancel);
    },
    [listRef, bl, mv],
  );

  const keyGrab = useCallback(
    (idx: number, e: React.KeyboardEvent<HTMLElement>) => {
      const list = bl.current;
      const b = list[idx];
      if (!b) return;
      const h = heldRef.current;
      const name = b.title || "ללא שם";
      if (!h || h.id !== b.id) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setHeld({ id: b.id, orig: idx });
          setMessage(`השלב "${name}" נבחר להזזה, כעת במקום ${idx + 1} מתוך ${list.length}. חץ למעלה או למטה להזזה, רווח לשחרור, Escape לביטול`);
        }
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Home" || e.key === "End") {
        e.preventDefault();
        const to = e.key === "ArrowUp" ? idx - 1 : e.key === "ArrowDown" ? idx + 1 : e.key === "Home" ? 0 : list.length - 1;
        if (to < 0 || to >= list.length || to === idx) {
          setMessage(to < 0 ? "זה כבר השלב הראשון" : to >= list.length ? "זה כבר השלב האחרון" : "");
          return;
        }
        mv.current(idx, to);
        setMessage(moveAnnounce(name, idx, to, list.length));
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setHeld(null);
        setMessage(`השלב "${name}" הונח במקום ${idx + 1} מתוך ${list.length}`);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (h.orig !== idx) mv.current(idx, h.orig);
        setHeld(null);
        setMessage(`ההזזה בוטלה, השלב "${name}" חזר למקום ${h.orig + 1}`);
      }
    },
    [bl, mv, heldRef],
  );

  const release = useCallback(() => setHeld(null), []);
  return { drop, dragging, held: held?.id ?? null, message, grab, keyGrab, release };
}

/* ───────────── נעילת שלב קצרה בעריכה משותפת (פריט 19) ───────────── */

/**
 * כשאני מקליד בשלב, השרת נועל אותו בשבילי ל-20 שניות ומתחדש כל 8 שניות. כשאני מפסיק, הנעילה משתחררת.
 * הנעילה מייעצת בלבד: גם אם שניים הקלידו יחד, השמירה ממזגת ברמת שלב ושום דבר לא נמחק.
 */
export function useBlockLock(o: { team: boolean; docId: number; token: string | null; getCid: () => string; curId: string | null; typing: boolean; onDenied: (by: string) => void }) {
  const { team, docId, token, curId, typing } = o;
  const held = useRef<string | null>(null);
  const cb = useLatest(o);
  const send = useCallback(
    async (block: string | null) => {
      const { getCid, docId: d, token: t, onDenied } = cb.current;
      const cid = getCid();
      if (!cid || !t) return;
      try {
        const r = await api<{ ok: boolean; by?: string }>(`/api/write/docs/${d}/live/lock`, { method: "POST", token: t, body: { cid, block } });
        if (r.ok === false && block) onDenied(r.by ?? "");
      } catch {
        /* אין חיבור חי כרגע: ממשיכים בלי נעילה */
      }
    },
    [cb],
  );
  useEffect(() => {
    if (!team || !token || !typing || !curId) return;
    held.current = curId;
    void send(curId);
    const t = window.setInterval(() => void send(curId), 8000);
    return () => {
      window.clearInterval(t);
      // מעבר לשלב אחר מחליף את הנעילה בעצמו; משחררים רק כשלא נלקח שלב חדש
      window.setTimeout(() => {
        if (held.current === curId) {
          held.current = null;
          void send(null);
        }
      }, 60);
    };
  }, [team, token, typing, curId, docId, send]);
}

/** מי נועל איזה שלב עכשיו (בלי אני), לפי רשימת הנוכחים מהשרת */
export function lockMap(people: LivePerson[], me: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of people) if (p.id !== me && p.lock) m.set(p.lock, p.name);
  return m;
}
