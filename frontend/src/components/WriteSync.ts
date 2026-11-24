"use client";

// שלב 75: שמירה אוטומטית, שמירה מקומית במכשיר ושחזור. הופרד מהעורך הגדול.
// מה שהשתנה מול הגרסה הקודמת:
//  - הנוסח המקומי נכתב בהשהיה קצרה ולא בכל הקלדה (זה היה אחד מהגורמים ל-INP גבוה).
//  - נוסח מקומי ישן כבר לא נמחק בשקט כשהמסמך השתנה בינתיים בשרת: ממזגים ברמת שלב, ואם אי אפשר, שואלים.
//  - חזרת רשת (אירוע online) שומרת מיד, בלי לחכות לניסיון הבא.
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import { mergeBlocks, mergeFields } from "@/lib/blockmerge";
import { limitProblems, recoveryPlan, type LimitProblem, type LocalBuffer, type W75Snap } from "@/lib/write75";
import { useToast } from "./Providers";
import type { Doc, Snap, useHistory } from "./WriteParts";

export type SyncStatus = "saved" | "saving" | "dirty" | "offline" | "error" | "conflict" | "limits";
export type Recover = null | { kind: "restore"; snap: Snap } | { kind: "merge"; snap: Snap; conflicts: string[]; mineChanged: number } | { kind: "conflict"; mine: Snap; theirs: Snap };

export const bufKey = (id: number) => `scout.write.buf.${id}`;
const asW = (s: Snap) => s as unknown as W75Snap;
const asSnap = (s: W75Snap) => s as unknown as Snap;
const toSnap = (d: Doc): Snap => ({ title: d.title, meta: d.meta, blocks: d.blocks });

interface Opts {
  initial: Doc;
  token: string | null;
  h: ReturnType<typeof useHistory>;
  team: boolean;
  /** מזהה החיבור החי, אם יש (עריכת צוות) */
  getCid: () => string;
}

export function useDocSync({ initial, token, h, team, getCid }: Opts) {
  const toast = useToast();
  const id = initial.id;
  const hr = useRef(h);
  hr.current = h;
  const rev = useRef(initial.rev);
  // שלב 70: baseRef = הנוסח האחרון שאושר בשרת (נקודת המוצא למיזוג ברמת שלב)
  const baseRef = useRef<{ rev: number; snap: Snap }>({ rev: initial.rev, snap: toSnap(initial) });
  const adoptSkip = useRef(false);
  const quiet = useRef(false);
  const [typing, setTyping] = useState(false);
  const typingT = useRef<number | undefined>(undefined);
  const [status, setStatus] = useState<SyncStatus>("saved");
  const [statusMsg, setStatusMsg] = useState("");
  const [problems, setProblems] = useState<LimitProblem[]>([]);
  const [savedAt, setSavedAt] = useState(initial.updatedAt);
  const [conflict, setConflict] = useState<Doc | null>(null);
  const [recover, setRecover] = useState<Recover>(null);
  const seq = useRef(0);
  const inflight = useRef(false);
  const again = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const bufT = useRef<number | undefined>(undefined);
  const mounted = useRef(false);
  const statusRef = useRef<SyncStatus>("saved");
  const getCidRef = useRef(getCid);
  getCidRef.current = getCid;
  const setSt = useCallback((s: SyncStatus, msg = "") => {
    statusRef.current = s;
    setStatus(s);
    setStatusMsg(msg);
  }, []);

  const clearBuf = useCallback(() => {
    window.clearTimeout(bufT.current);
    try {
      localStorage.removeItem(bufKey(id));
    } catch {
      /* אחסון חסום */
    }
  }, [id]);

  /** כותב את הנוסח שעוד לא הגיע לשרת למכשיר, יחד עם נקודת המוצא שלו */
  const writeBuf = useCallback(() => {
    window.clearTimeout(bufT.current);
    if (statusRef.current === "saved") return;
    try {
      const b: LocalBuffer = { rev: rev.current, snap: asW(hr.current.current.current), base: asW(baseRef.current.snap), at: Date.now() };
      localStorage.setItem(bufKey(id), JSON.stringify(b));
    } catch {
      /* אין מקום: השמירה בשרת עדיין פועלת */
    }
  }, [id]);

  // ───── שמירה אוטומטית (103) ─────
  const flush = useCallback(async () => {
    if (inflight.current) {
      again.current = true;
      return;
    }
    if (statusRef.current === "conflict") return;
    const snap = hr.current.current.current;
    const probs = limitProblems(snap);
    if (probs.length) {
      // לא שולחים מה שהשרת ידחה: אומרים מה לתקן. הנוסח נשאר שמור במכשיר
      setProblems(probs);
      setSt("limits", probs.length > 1 ? `${probs[0].message} (ועוד ${probs.length - 1})` : probs[0].message);
      writeBuf();
      return;
    }
    setProblems((p) => (p.length ? [] : p));
    inflight.current = true;
    const mySeq = seq.current;
    setSt("saving");
    try {
      const d = await api<Doc & { merged?: boolean; conflicts?: string[] }>(`/api/write/docs/${id}`, {
        method: "PUT",
        token,
        body: { title: snap.title, meta: snap.meta, blocks: snap.blocks.map(({ hint, ...b }) => ({ ...b, ...(hint ? { hint } : {}) })), baseRev: rev.current, ...(team ? { merge: true, cid: getCidRef.current() || undefined } : {}) },
      });
      rev.current = d.rev;
      baseRef.current = { rev: d.rev, snap: toSnap(d) };
      if (d.merged) {
        // השרת מיזג לנוסח שלי שינויים של מדריכים אחרים
        const theirs = toSnap(d);
        if (seq.current === mySeq) {
          adoptSkip.current = true;
          hr.current.reset(theirs);
        } else {
          const nowSnap = hr.current.current.current; // המשכתי להקליד בזמן השמירה: ממזגים מקומית מול מה ששלחתי
          quiet.current = true;
          hr.current.set(() => ({ title: nowSnap.title === snap.title ? d.title : nowSnap.title, meta: mergeFields(snap.meta, nowSnap.meta, d.meta), blocks: mergeBlocks(snap.blocks, nowSnap.blocks, d.blocks).blocks }));
        }
        if (d.conflicts?.length) toast("שני מדריכים ערכו את אותו שלב. נשמר הנוסח שלך, והנוסח של האחר נשמר ב״גרסאות״.", { kind: "info" });
      }
      setSavedAt(d.updatedAt);
      if (seq.current === mySeq) {
        setSt("saved");
        clearBuf();
      } else setSt("dirty");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        try {
          setConflict(await api<Doc>(`/api/write/docs/${id}`, { token }));
        } catch {
          /* ננסה שוב בהקלדה הבאה */
        }
        setSt("conflict");
      } else if (e instanceof ApiError && e.code === "LIMITS") {
        setSt("limits", errorMessage(e));
      } else if (e instanceof ApiError) {
        setSt("error", errorMessage(e));
      } else {
        setSt("offline");
        writeBuf();
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => flush(), 8000);
      }
    }
    inflight.current = false;
    if (again.current) {
      again.current = false;
      if ((statusRef.current as SyncStatus) !== "conflict") flush();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id, team, writeBuf, clearBuf]);

  const saveNow = useCallback(() => {
    window.clearTimeout(timer.current);
    return flush();
  }, [flush]);

  // שלב 70: מישהו אחר שמר. אם אין לי שינויים שלא נשמרו מחליפים, אחרת ממזגים ברמת שלב.
  const adopt = useCallback(
    (d: Doc) => {
      rev.current = d.rev;
      baseRef.current = { rev: d.rev, snap: toSnap(d) };
      adoptSkip.current = true;
      hr.current.reset(toSnap(d));
      setSavedAt(d.updatedAt);
      setSt("saved");
      clearBuf();
    },
    [setSt, clearBuf],
  );
  const pullRemote = useCallback(async () => {
    if (statusRef.current === "conflict" || !token) return;
    try {
      const d = await api<Doc>(`/api/write/docs/${id}`, { token, cache: "no-store" });
      if (d.rev <= rev.current) return;
      if (statusRef.current === "saved" && !inflight.current) {
        adopt(d);
        return;
      }
      const base = baseRef.current.snap;
      const mine = hr.current.current.current;
      rev.current = d.rev; // הבסיס החדש: השרת. השינויים שלי נשלחים מעליו
      baseRef.current = { rev: d.rev, snap: toSnap(d) };
      quiet.current = true;
      hr.current.set(() => ({ title: mine.title === base.title ? d.title : mine.title, meta: mergeFields(base.meta, mine.meta, d.meta), blocks: mergeBlocks(base.blocks, mine.blocks, d.blocks).blocks }));
    } catch {
      /* רשת: ננסה בהודעה הבאה */
    }
  }, [adopt, id, token]);

  /** אחרי שחזור גרסה מהשרת: הנוסח החדש הוא גם הבסיס */
  const afterServerReplace = useCallback(
    (d: Doc) => {
      rev.current = d.rev;
      baseRef.current = { rev: d.rev, snap: toSnap(d) };
      setSavedAt(d.updatedAt);
      setSt("saved");
    },
    [setSt],
  );

  // כל שינוי בנוסח: מסמנים "יש שינויים", כותבים למכשיר בהשהיה, ושומרים בשרת אחרי 1.5 שניות
  const stateNow = h.state;
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (adoptSkip.current) {
      adoptSkip.current = false;
      return;
    }
    if (quiet.current) quiet.current = false;
    else {
      setTyping(true);
      window.clearTimeout(typingT.current);
      typingT.current = window.setTimeout(() => setTyping(false), 4000);
    }
    seq.current++;
    if (statusRef.current !== "conflict") setSt("dirty");
    window.clearTimeout(bufT.current);
    bufT.current = window.setTimeout(writeBuf, 700);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush(), 1500);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateNow]);

  // נוסח שלא הגיע לשרת (סגירה פתאומית, נפילת חיבור או מסמך שהשתנה בינתיים)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(bufKey(id));
      if (!raw) return;
      const b = JSON.parse(raw) as LocalBuffer;
      if (!b || !b.snap || !Array.isArray(b.snap.blocks) || typeof b.rev !== "number") {
        localStorage.removeItem(bufKey(id));
        return;
      }
      const plan = recoveryPlan(b, { rev: initial.rev, snap: asW(toSnap(initial)) }, { blocks: mergeBlocks, fields: mergeFields });
      if (plan.kind === "none") localStorage.removeItem(bufKey(id));
      else if (plan.kind === "restore") setRecover({ kind: "restore", snap: asSnap(plan.snap) });
      else if (plan.kind === "merge") setRecover({ kind: "merge", snap: asSnap(plan.snap), conflicts: plan.conflicts, mineChanged: plan.mineChanged });
      else setRecover({ kind: "conflict", mine: asSnap(plan.mine), theirs: asSnap(plan.theirs) });
    } catch {
      /* נוסח מקומי פגום: מתעלמים */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // סגירה, מעבר לכרטיסייה אחרת וחזרת רשת
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (statusRef.current !== "saved") {
        writeBuf();
        e.preventDefault();
      }
    };
    const hide = () => {
      if (document.visibilityState === "hidden") {
        writeBuf();
        if (statusRef.current === "dirty") flush();
      }
    };
    const online = () => {
      if (statusRef.current === "offline" || statusRef.current === "dirty") {
        window.clearTimeout(timer.current);
        flush();
      }
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("pagehide", writeBuf);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("pagehide", writeBuf);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [flush, writeBuf]);
  // יציאה מהעמוד בתוך האתר: מה שלא נשמר נשאר במכשיר ויוצע לשחזור
  const writeRef = useRef(writeBuf);
  writeRef.current = writeBuf;
  useEffect(() => () => writeRef.current(), []);

  const applyRecovery = useCallback(async () => {
    const r = recover;
    if (!r) return;
    if (r.kind === "conflict") {
      // לא דורסים בשקט: קודם נקודת שמירה של מה שיש בשרת
      try {
        await api(`/api/write/docs/${id}/snapshot`, { method: "POST", token, body: { label: "לפני שחזור מהמכשיר" } });
      } catch {
        /* נקודת השמירה היא רשת ביטחון, לא תנאי */
      }
      hr.current.set(() => r.mine);
    } else hr.current.set(() => r.snap);
    setRecover(null);
  }, [recover, id, token]);
  const dropRecovery = useCallback(() => {
    setRecover(null);
    clearBuf();
  }, [clearBuf]);

  return { rev, baseRef, status, statusMsg, statusRef, problems, savedAt, conflict, setConflict, typing, recover, setSt, flush, saveNow, adopt, pullRemote, afterServerReplace, applyRecovery, dropRecovery, clearBuf, writeBuf };
}
