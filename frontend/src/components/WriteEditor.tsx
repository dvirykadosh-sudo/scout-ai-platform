"use client";

// עורך כתיבה חופשי, רעיונות 101–112.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, errorMessage, fmtDate, storageGet, storageSet } from "@/lib/api";
import { AGE_GROUPS } from "@/lib/constants";
import { useAuth, useToast } from "./Providers";
import { Field, Modal } from "./ui";
import { ReadabilityModal, RunMode, ShareModal, SnippetsModal, clockTimes, distributeMinutes } from "./WriteMore";
import { GroupsModal, ParentsModal, PRESETS, PrepPanel, SearchAllModal, SimilarNotice, icsFor, presetBlock } from "./WriteMore4";
import { CommentsModal, cleanText, useDictation, wordDiff } from "./WriteMore3";
import { ImportStagesModal, QuestionsModal, RunLogModal, ShortcutsModal, SummarySheet } from "./WriteMore2";
import { BackupPlanModal, ReadinessModal, StationsModal, TourButton, TribeMethodsModal } from "./WriteFinal";
import { ExportModal, ImportModal, PrepModal, PrintSheet } from "./WriteExtras";
import { MoreToolsModal, OutdoorHint } from "./WriteV36";
import { EditorProgress } from "./Polish";
import { StageModeModal } from "./Depth3D2";
import { ToolboxModal } from "./WriteV51";
import { GameRulesModal, HolidayModal, HooksModal, IllustrationsModal, MergeModal, ParticipationModal, SeriesModal, TranslateModal, ViewersModal, VoiceNotesModal, type V50Tool } from "./WriteV50";
import { MapModal, PracticeModal, PrintablesModal, ReadAloudModal, StoryQuizModal } from "./WriteV47";
import { AgeAdaptModal, SafetyModal, StageQuestionsModal, VoiceCheckModal } from "./WriteV39";
import { GapsPanel, HelpModal, PrefsModal, SearchModal, StageCompare, useCatalog, type InsertFn } from "./WriteHelp";
import { KINDS, KIND_LABEL, Md, countWords, emptyBlock, newBlockId, flatten, readAloud, sumMinutes, useHistory, type Block, type Doc, type Kind, type Snap } from "./WriteParts";

const bufKey = (id: number) => `scout.write.buf.${id}`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
type Status = "saved" | "saving" | "dirty" | "offline" | "error" | "conflict";

interface Match {
  b: number;
  field: "title" | "text";
  start: number;
  end: number;
}
interface VersionRow {
  id: number;
  title: string;
  words: number;
  note: string | null;
  savedAt: string;
}

export function WriteEditor({ initial }: { initial: Doc }) {
  const { token, user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const first: Snap = { title: initial.title, meta: initial.meta, blocks: initial.blocks };
  const h = useHistory(first);
  const { state } = h;
  const rev = useRef(initial.rev);
  const [status, setStatus] = useState<Status>("saved");
  const [statusMsg, setStatusMsg] = useState("");
  const [savedAt, setSavedAt] = useState(initial.updatedAt);
  const [conflict, setConflict] = useState<Doc | null>(null);
  const [recover, setRecover] = useState<Snap | null>(null);
  const seq = useRef(0);
  const inflight = useRef(false);
  const again = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const mounted = useRef(false);
  const statusRef = useRef<Status>("saved");
  const setSt = (s: Status, msg = "") => {
    statusRef.current = s;
    setStatus(s);
    setStatusMsg(msg);
  };

  const [preview, setPreview] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [find, setFind] = useState("");
  const [repl, setRepl] = useState("");
  const [cursor, setCursor] = useState(-1);
  const [findMsg, setFindMsg] = useState("");
  const [verOpen, setVerOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [verView, setVerView] = useState<{ id: number; text: string; title: string; snap: Snap } | null>(null);
  const [helpFor, setHelpFor] = useState<string | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [gapsOn, setGapsOn] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [prepOpen, setPrepOpen] = useState(false);
  const [snipOpen, setSnipOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [readOpen, setReadOpen] = useState(false);
  const [runOn, setRunOn] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [qOpen, setQOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [tool, setTool] = useState<"" | "voice" | "safety" | "age" | "questions" | "map" | "read" | "practice" | "story" | "print" | "stage" | V50Tool>("");
  const [fin, setFin] = useState<"" | "stations" | "backup" | "ready" | "tribe">("");
  const [stagesOpen, setStagesOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [comOpen, setComOpen] = useState(false);
  const [searchAllOpen, setSearchAllOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [parentsOpen, setParentsOpen] = useState(false);
  const [comCount, setComCount] = useState(0);
  const [dictId, setDictId] = useState<string | null>(null);
  const cat = useCatalog(token);
  const [label, setLabel] = useState("");
  const [addKind, setAddKind] = useState<Kind>("free");
  const dragFrom = useRef<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // ───── שמירה אוטומטית (103) ─────
  const flush = useCallback(async () => {
    if (inflight.current) {
      again.current = true;
      return;
    }
    if (statusRef.current === "conflict") return;
    inflight.current = true;
    const mySeq = seq.current;
    const snap = h.current.current;
    setSt("saving");
    try {
      const d = await api<Doc>(`/api/write/docs/${initial.id}`, { method: "PUT", token, body: { title: snap.title, meta: snap.meta, blocks: snap.blocks.map(({ hint, ...b }) => ({ ...b, ...(hint ? { hint } : {}) })), baseRev: rev.current } });
      rev.current = d.rev;
      setSavedAt(d.updatedAt);
      if (seq.current === mySeq) {
        setSt("saved");
        try {
          localStorage.removeItem(bufKey(initial.id));
        } catch {}
      } else setSt("dirty");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        try {
          setConflict(await api<Doc>(`/api/write/docs/${initial.id}`, { token }));
        } catch {}
        setSt("conflict");
      } else if (e instanceof ApiError) {
        setSt("error", errorMessage(e));
      } else {
        setSt("offline");
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => flush(), 8000);
      }
    }
    inflight.current = false;
    if (again.current) {
      again.current = false;
      if ((statusRef.current as Status) !== "conflict") flush();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, initial.id]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    seq.current++;
    if (statusRef.current !== "conflict") setSt("dirty");
    try {
      localStorage.setItem(bufKey(initial.id), JSON.stringify({ rev: rev.current, snap: state }));
    } catch {}
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush(), 1500);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // נוסח שלא נשמר בשרת (סגירה פתאומית או נפילת חיבור)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(bufKey(initial.id));
      if (!raw) return;
      const b = JSON.parse(raw) as { rev: number; snap: Snap };
      if (b.rev === initial.rev && JSON.stringify(b.snap) !== JSON.stringify(first)) setRecover(b.snap);
      else localStorage.removeItem(bufKey(initial.id));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (statusRef.current !== "saved") e.preventDefault();
    };
    const hide = () => {
      if (document.visibilityState === "hidden" && statusRef.current === "dirty") flush();
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [flush]);

  // ───── עריכה ─────
  const setBlock = (id: string, patch: Partial<Block>, coalesce = false) => h.set((s) => ({ ...s, blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }), coalesce);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= state.blocks.length || from === to) return;
    h.set((s) => {
      const arr = [...s.blocks];
      const [x] = arr.splice(from, 1);
      arr.splice(to, 0, x);
      return { ...s, blocks: arr };
    });
    setActive(to);
  };
  const addAfter = (idx: number, kind: Kind) => {
    const b = emptyBlock(kind);
    h.set((s) => ({ ...s, blocks: [...s.blocks.slice(0, idx + 1), b, ...s.blocks.slice(idx + 1)] }));
    setActive(idx + 1);
    window.setTimeout(() => document.getElementById(`wb-title-${b.id}`)?.focus(), 30);
  };
  const remove = (idx: number) => {
    const b = state.blocks[idx];
    if ((b.text.trim() || b.note.trim()) && !window.confirm("לשלב הזה יש תוכן. למחוק אותו? אפשר לבטל מיד עם הכפתור 'ביטול'.")) return;
    h.set((s) => ({ ...s, blocks: s.blocks.filter((x) => x.id !== b.id) }));
    setActive(Math.max(0, idx - 1));
  };

  const duplicate = (idx: number) => {
    const src = state.blocks[idx];
    if (state.blocks.length >= 60) return toast("אפשר עד 60 שלבים", { kind: "error" });
    const copy: Block = { ...src, id: newBlockId(), title: src.title ? `${src.title} (עותק)`.slice(0, 120) : "" };
    h.set((s) => ({ ...s, blocks: [...s.blocks.slice(0, idx + 1), copy, ...s.blocks.slice(idx + 1)] }));
    setActive(idx + 1);
  };
  const splitAtCursor = (idx: number) => {
    const b = state.blocks[idx];
    const el = document.getElementById(`wb-text-${b.id}`) as HTMLTextAreaElement | null;
    const pos = el?.selectionStart ?? 0;
    if (!el || pos <= 0 || pos >= b.text.length) return toast("הציבו את הסמן בתוך הטקסט, במקום שבו רוצים לפצל", { kind: "error" });
    if (state.blocks.length >= 60) return toast("אפשר עד 60 שלבים", { kind: "error" });
    const second: Block = { ...emptyBlock(b.kind === "open" ? "body" : b.kind), title: b.title ? `${b.title} (המשך)`.slice(0, 120) : "", text: b.text.slice(pos).replace(/^\s+/, "") };
    h.set((s) => ({ ...s, blocks: s.blocks.flatMap((x) => (x.id === b.id ? [{ ...x, text: x.text.slice(0, pos).replace(/\s+$/, "") }, second] : [x])) }));
    setActive(idx + 1);
    toast("השלב פוצל לשניים. אפשר לבטל", { kind: "success" });
  };
  const autoMinutes = () => {
    const goal = state.meta.minutes;
    if (!goal) return toast("קודם קבעו משך מתוכנן", { kind: "error" });
    const parts = distributeMinutes(state.blocks, goal);
    h.set((s) => ({ ...s, blocks: s.blocks.map((b, i) => ({ ...b, minutes: parts[i] })) }));
    toast(`הזמן חולק בין השלבים: ${parts.join(" + ")} דקות. אפשר לבטל`, { kind: "success" });
  };
  const printCards = () => {
    document.body.classList.add("printing-write", "printing-cards");
    const done = () => {
      document.body.classList.remove("printing-write", "printing-cards");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.setTimeout(() => window.print(), 50);
  };
  const printSummary = () => {
    document.body.classList.add("printing-summary");
    const done = () => {
      document.body.classList.remove("printing-summary");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.setTimeout(() => window.print(), 50);
  };
  const dictTarget = useRef<string | null>(null);
  const dict = useDictation((t) => {
    const id = dictTarget.current;
    if (id && t) insertText(id, t, "append");
  });
  const toggleDict = (id: string) => {
    if (dict.on && dictTarget.current === id) {
      dict.stop();
      dictTarget.current = null;
      setDictId(null);
      return;
    }
    if (dict.on) dict.stop();
    dictTarget.current = id;
    setDictId(id);
    dict.start();
  };
  const cleanAll = () => {
    h.set((s) => ({ ...s, blocks: s.blocks.map((b) => ({ ...b, text: cleanText(b.text) })) }));
    toast("הרווחים נוקו. אפשר לבטל", { kind: "success" });
  };
  const publishTribe = async () => {
    if (!window.confirm("לפרסם את המסמך כתבנית לכל מדריכי השבט? ההערות האישיות לא יועתקו.")) return;
    try {
      await flush();
      await api("/api/admin/write-templates", { method: "POST", token, body: { docId: initial.id, title: state.title } });
      toast("פורסם כתבנית שבט", { kind: "success" });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const endClock = (() => {
    const m = /^(\d{2}):(\d{2})$/.exec(state.meta.startTime ?? "");
    const tt = sumMinutes(state.blocks);
    if (!m || !tt) return "";
    const t = Number(m[1]) * 60 + Number(m[2]) + tt;
    return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  })();
  const addPreset = (id: string) => {
    const b = presetBlock(id);
    if (!b) return;
    if (state.blocks.length >= 60) return toast("אפשר עד 60 שלבים", { kind: "error" });
    h.set((s) => ({ ...s, blocks: [...s.blocks.slice(0, active + 1), b, ...s.blocks.slice(active + 1)] }));
    setActive(active + 1);
    window.setTimeout(() => document.getElementById(`wb-title-${b.id}`)?.focus(), 30);
  };
  const downloadIcs = () => {
    const ics = icsFor(state, sumMinutes(state.blocks));
    if (!ics) return toast("קודם קבעו תאריך לפעולה בכותרת המסמך", { kind: "error" });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(state.title || "פעולה").replace(/[\\/:*?"<>|]/g, " ").slice(0, 50)}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  const doneCount = state.blocks.filter((b) => b.done).length;
  const clocks = clockTimes(state.blocks, state.meta.startTime ?? "");

  // הכנסת הצעה לשלב (115–117). הכול נכנס להיסטוריית הביטול הרגילה.
  const insertText: InsertFn = (id, text, mode, what) => {
    const b = state.blocks.find((x) => x.id === id);
    if (!b) return;
    const cur = b.text;
    if (mode === "replace-all") return setBlock(id, { text });
    if (mode === "replace-sentence" && what && cur.includes(what)) return setBlock(id, { text: cur.replace(what, text) });
    if (mode === "cursor") {
      const el = document.getElementById(`wb-text-${id}`) as HTMLTextAreaElement | null;
      if (el && cur) {
        const pos = Math.min(el.selectionStart ?? cur.length, cur.length);
        const before = cur.slice(0, pos);
        const after = cur.slice(pos);
        const pre = before && !before.endsWith("\n") ? "\n" : "";
        const post = after && !after.startsWith("\n") ? "\n" : "";
        return setBlock(id, { text: before + pre + text + post + after });
      }
    }
    setBlock(id, { text: cur.trim() ? cur.replace(/\s+$/, "") + "\n\n" + text : text });
  };
  const restoreStage = (id: string, text: string) => {
    setBlock(id, { text });
    toast("טקסט השלב הוחזר. אפשר לבטל עם 'ביטול'", { kind: "success" });
  };

  // עיצוב על הטקסט המסומן (102)
  const edit = (id: string, fn: (v: string, a: number, b: number) => { v: string; a: number; b: number }) => {
    const el = document.getElementById(`wb-text-${id}`) as HTMLTextAreaElement | null;
    if (!el) return;
    const r = fn(el.value, el.selectionStart, el.selectionEnd);
    setBlock(id, { text: r.v });
    window.requestAnimationFrame(() => {
      const e2 = document.getElementById(`wb-text-${id}`) as HTMLTextAreaElement | null;
      e2?.focus();
      e2?.setSelectionRange(r.a, r.b);
    });
  };
  const wrap = (id: string, mark: string, ph: string) =>
    edit(id, (v, a, b) => {
      const sel = v.slice(a, b) || ph;
      return { v: v.slice(0, a) + mark + sel + mark + v.slice(b), a: a + mark.length, b: a + mark.length + sel.length };
    });
  const prefix = (id: string, fn: (i: number) => string) =>
    edit(id, (v, a, b) => {
      const start = v.lastIndexOf("\n", a - 1) + 1;
      let end = v.indexOf("\n", b);
      if (end < 0) end = v.length;
      const lines = v.slice(start, end).split("\n");
      const out = lines.map((l, i) => fn(i) + l.replace(/^(#{1,4}\s+|[-*]\s+|\d+[.)]\s+|>\s?)/, "")).join("\n");
      return { v: v.slice(0, start) + out + v.slice(end), a: start, b: start + out.length };
    });
  const table = (id: string) =>
    edit(id, (v, a, b) => {
      const t = `${a > 0 && v[a - 1] !== "\n" ? "\n" : ""}| כותרת א | כותרת ב |\n|---|---|\n| תא | תא |\n`;
      return { v: v.slice(0, a) + t + v.slice(b), a: a + t.length, b: a + t.length };
    });

  const keys = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (!(t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement)) return;
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      move(active, active + (e.key === "ArrowUp" ? -1 : 1));
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === "s") {
      e.preventDefault();
      window.clearTimeout(timer.current);
      flush();
      toast("נשמר", { kind: "success" });
    } else if (k === "z" && !e.shiftKey) {
      e.preventDefault();
      h.undo();
    } else if (k === "y" || (k === "z" && e.shiftKey)) {
      e.preventDefault();
      h.redo();
    } else if (k === "b" && t instanceof HTMLTextAreaElement && t.id.startsWith("wb-text-")) {
      e.preventDefault();
      wrap(t.id.slice(8), "**", "טקסט מודגש");
    }
  };

  // ───── חיפוש והחלפה (110) ─────
  const matches = useMemo<Match[]>(() => {
    if (!find) return [];
    const re = new RegExp(esc(find), "gi");
    const out: Match[] = [];
    state.blocks.forEach((b, i) => {
      for (const field of ["title", "text"] as const) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(b[field]))) {
          out.push({ b: i, field, start: m.index, end: m.index + m[0].length });
          if (!m[0].length) re.lastIndex++;
        }
      }
    });
    return out;
  }, [find, state.blocks]);
  const goTo = (i: number) => {
    const m = matches[i];
    if (!m) return;
    setCursor(i);
    const b = state.blocks[m.b];
    setActive(m.b);
    setPreview((p) => {
      const n = new Set(p);
      n.delete(b.id);
      return n;
    });
    window.setTimeout(() => {
      const el = document.getElementById(m.field === "text" ? `wb-text-${b.id}` : `wb-title-${b.id}`) as HTMLInputElement | HTMLTextAreaElement | null;
      el?.focus();
      el?.setSelectionRange(m.start, m.end);
      el?.scrollIntoView({ block: "center" });
    }, 30);
  };
  const next = () => {
    if (!matches.length) return setFindMsg("לא נמצא");
    setFindMsg("");
    goTo(cursor + 1 < matches.length ? cursor + 1 : 0);
  };
  const replaceOne = () => {
    const i = cursor >= 0 && cursor < matches.length ? cursor : 0;
    const m = matches[i];
    if (!m) return setFindMsg("לא נמצא");
    h.set((s) => ({ ...s, blocks: s.blocks.map((b, bi) => (bi === m.b ? { ...b, [m.field]: b[m.field].slice(0, m.start) + repl + b[m.field].slice(m.end) } : b)) }));
    setFindMsg("הוחלף מופע אחד");
    setCursor(Math.max(0, i - 1));
  };
  const replaceAll = () => {
    if (!matches.length) return setFindMsg("לא נמצא");
    const re = new RegExp(esc(find), "gi");
    const n = matches.length;
    h.set((s) => ({ ...s, blocks: s.blocks.map((b) => ({ ...b, title: b.title.replace(re, () => repl), text: b.text.replace(re, () => repl) })) }));
    setFindMsg(`הוחלפו ${n} מופעים. אפשר לבטל בלחיצה אחת`);
    setCursor(-1);
  };

  // ───── גרסאות (112) ─────
  const loadVersions = useCallback(() => {
    api<VersionRow[]>(`/api/write/docs/${initial.id}/versions`, { token })
      .then(setVersions)
      .catch((e) => toast(errorMessage(e), { kind: "error" }));
  }, [initial.id, token, toast]);
  const openVersions = async () => {
    setVerView(null);
    setVerOpen(true);
    if (statusRef.current === "dirty") await flush();
    loadVersions();
  };
  const viewVersion = async (v: VersionRow) => {
    try {
      const d = await api<Snap>(`/api/write/docs/${initial.id}/versions/${v.id}`, { token });
      setVerView({ id: v.id, title: v.note || fmtDate(v.savedAt), text: flatten(d), snap: { title: d.title, meta: d.meta, blocks: d.blocks } });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const restore = async (id: number) => {
    if (!window.confirm("לשחזר את הגרסה הזו? המצב הנוכחי יישמר כגרסה 'לפני שחזור'.")) return;
    try {
      if (statusRef.current === "dirty") await flush();
      const d = await api<Doc>(`/api/write/docs/${initial.id}/versions/${id}/restore`, { method: "POST", token, body: {} });
      rev.current = d.rev;
      setSavedAt(d.updatedAt);
      h.set(() => ({ title: d.title, meta: d.meta, blocks: d.blocks }));
      setSt("saved");
      setVerOpen(false);
      toast("הגרסה שוחזרה", { kind: "success" });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const savePoint = async () => {
    try {
      if (statusRef.current === "dirty") await flush();
      await api(`/api/write/docs/${initial.id}/snapshot`, { method: "POST", token, body: { label: label.trim() } });
      setLabel("");
      toast("נקודת השמירה נוצרה", { kind: "success" });
      loadVersions();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };

  // ───── יציאה ─────
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(flatten(state));
      toast("הטקסט הועתק", { kind: "success" });
    } catch {
      toast("ההעתקה נכשלה. סמנו ידנית", { kind: "error" });
    }
  };
  const toAssistant = () => {
    if (storageGet("scout.assist.draft")?.trim() && !window.confirm("בעוזר הכתיבה כבר יש טיוטה. להחליף אותה בטקסט של המסמך הזה?")) return;
    storageSet("scout.assist.draft", flatten(state));
    if (state.meta.ageGroup) storageSet("scout.assist.age", state.meta.ageGroup);
    if (state.meta.minutes) storageSet("scout.assist.target", String(state.meta.minutes));
    router.push("/assistant");
  };

  useEffect(() => {
    if (!focusMode) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setFocusMode(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [focusMode]);

  const words = countWords(state);
  const total = sumMinutes(state.blocks);
  const target = state.meta.minutes;
  const diff = target ? total - target : 0;
  const cur = state.blocks[Math.min(active, state.blocks.length - 1)];
  const statusText =
    status === "saved" ? `נשמר ${new Date(savedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}` : status === "saving" ? "שומר..." : status === "dirty" ? "יש שינויים, נשמרים בעוד רגע" : status === "offline" ? "אין חיבור. הטקסט שמור במכשיר ויישמר בשרת כשהחיבור יחזור" : status === "conflict" ? "המסמך עודכן במקום אחר" : `השמירה נכשלה: ${statusMsg}`;

  return (
    <div className="write" ref={root} onKeyDown={keys}>
      {conflict && (
        <div className="error-box" role="alert">
          <p>המסמך הזה עודכן בלשונית או במכשיר אחר, ולכן לא שמרנו כדי לא לדרוס. מה לעשות?</p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                rev.current = conflict.rev;
                h.reset({ title: conflict.title, meta: conflict.meta, blocks: conflict.blocks });
                setConflict(null);
                setSt("saved");
                try {
                  localStorage.removeItem(bufKey(initial.id));
                } catch {}
              }}
            >
              לטעון את הנוסח העדכני (השינויים שלי כאן יימחקו)
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                rev.current = conflict.rev;
                setConflict(null);
                setSt("dirty");
                flush();
              }}
            >
              לשמור את הנוסח שלי מעל
            </button>
          </div>
        </div>
      )}
      {recover && (
        <div className="warn-box" role="status">
          <p>נמצא נוסח שהקלדתם ולא הגיע לשרת (סגירה פתאומית או נפילת חיבור). לשחזר אותו?</p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                h.set(() => recover);
                setRecover(null);
              }}
            >
              שחזור הנוסח
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                setRecover(null);
                try {
                  localStorage.removeItem(bufKey(initial.id));
                } catch {}
              }}
            >
              להתעלם
            </button>
          </div>
        </div>
      )}

      <div className="card glass write-meta">
        <Field label="שם הפעולה" htmlFor="w-title">
          <input id="w-title" value={state.title} maxLength={120} onChange={(e) => h.set((s) => ({ ...s, title: e.target.value }), true)} placeholder="למשל: מה זה אומץ" />
        </Field>
        <Field label="שכבה" htmlFor="w-age">
          <select id="w-age" value={state.meta.ageGroup} onChange={(e) => h.set((s) => ({ ...s, meta: { ...s.meta, ageGroup: e.target.value } }))}>
            <option value="">לא נבחרה</option>
            {AGE_GROUPS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
        <Field label="משך מתוכנן (דקות)" htmlFor="w-min">
          <input id="w-min" type="number" min={0} max={480} dir="ltr" value={target ?? ""} onChange={(e) => h.set((s) => ({ ...s, meta: { ...s.meta, minutes: e.target.value === "" ? null : Math.max(0, Math.min(480, Math.round(Number(e.target.value)))) } }), true)} />
        </Field>
        <Field label="גודל קבוצה" htmlFor="w-size">
          <input id="w-size" type="number" min={0} max={200} dir="ltr" value={state.meta.groupSize ?? ""} onChange={(e) => h.set((s) => ({ ...s, meta: { ...s.meta, groupSize: e.target.value === "" ? null : Math.max(0, Math.min(200, Math.round(Number(e.target.value)))) } }), true)} />
        </Field>
        <datalist id="w-values">
          {["אחריות", "אומץ", "חברות", "יושרה", "כבוד", "נתינה", "התנדבות", "ערבות הדדית", "הגינות", "אהבת הארץ", "עבודת צוות", "סבלנות", "הקשבה", "התמדה"].map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <Field label="שעת התחלה" htmlFor="w-start" hint="מציגה שעה לכל שלב">
          <input id="w-start" type="time" dir="ltr" value={state.meta.startTime ?? ""} onChange={(e) => h.set((s) => ({ ...s, meta: { ...s.meta, startTime: e.target.value } }))} />
        </Field>
        <Field label="תגיות" htmlFor="w-tags" hint="מופרדות בפסיק, עד 8">
          <input
            id="w-tags"
            defaultValue={(state.meta.tags ?? []).join(", ")}
            key={(state.meta.tags ?? []).join("|")}
            onBlur={(e) => {
              const tags = [...new Set(e.target.value.split(/[,،]/).map((x) => x.trim().slice(0, 20)).filter(Boolean))].slice(0, 8);
              if (tags.join("|") !== (state.meta.tags ?? []).join("|")) h.set((s) => ({ ...s, meta: { ...s.meta, tags } }));
            }}
          />
        </Field>
        <Field label="שם המדריך/ה" htmlFor="w-leader" hint="יופיע בקובץ Word ובהדפסה">
          <input id="w-leader" value={state.meta.leader ?? ""} maxLength={60} onChange={(e) => h.set((s) => ({ ...s, meta: { ...s.meta, leader: e.target.value } }), true)} />
        </Field>
        <Field label="תאריך הפעולה" htmlFor="w-date">
          <input id="w-date" type="date" dir="ltr" value={state.meta.date ?? ""} onChange={(e) => h.set((s) => ({ ...s, meta: { ...s.meta, date: e.target.value } }))} />
        </Field>
        <label className="check write-pin">
          <input type="checkbox" checked={!!state.meta.pinned} onChange={(e) => h.set((s) => ({ ...s, meta: { ...s.meta, pinned: e.target.checked } }))} />
          <span>סימון בכוכב (יופיע ראשון ברשימה)</span>
        </label>
        <label className="check write-pin">
          <input type="checkbox" checked={!!state.meta.template} onChange={(e) => h.set((s) => ({ ...s, meta: { ...s.meta, template: e.target.checked } }))} />
          <span>שמירה כתבנית אישית</span>
        </label>
        <label className="check write-pin">
          <input type="checkbox" checked={!!state.meta.archived} onChange={(e) => h.set((s) => ({ ...s, meta: { ...s.meta, archived: e.target.checked } }))} />
          <span>העברה לארכיון</span>
        </label>
        <Field label="ערך או מטרה" htmlFor="w-value" hint="ההצעות יחברו אליו">
          <input id="w-value" list="w-values" value={state.meta.value ?? ""} maxLength={40} onChange={(e) => h.set((s) => ({ ...s, meta: { ...s.meta, value: e.target.value } }), true)} placeholder="למשל: אחריות" />
        </Field>
        {cat && (
          <fieldset className="write-gear">
            <legend>ציוד שיש לכם</legend>
            {cat.gear.map((g) => {
              const on = (state.meta.gear ?? []).includes(g.id);
              return (
                <label key={g.id} className="check-inline">
                  <input type="checkbox" checked={on} onChange={() => h.set((s) => ({ ...s, meta: { ...s.meta, gear: on ? (s.meta.gear ?? []).filter((x) => x !== g.id) : [...(s.meta.gear ?? []), g.id] } }))} />
                  {g.label}
                </label>
              );
            })}
          </fieldset>
        )}
      </div>

      <OutdoorHint snap={state} onOpen={() => setFin("backup")} />
      <div className="write-bar card glass" role="region" aria-label="סרגל כלים ומצב המסמך">
        <p className={`write-status st-${status}`} role="status" aria-live="polite">
          {statusText}
        </p>
        <EditorProgress total={total} target={target ?? undefined} blocks={state.blocks} />
        <div className="actions">
          <button type="button" className="btn btn-small" onClick={h.undo} disabled={!h.canUndo}>
            ביטול
          </button>
          <button type="button" className="btn btn-small" onClick={h.redo} disabled={!h.canRedo}>
            שחזור
          </button>
          <button type="button" className="btn btn-small" aria-expanded={findOpen} onClick={() => setFindOpen(!findOpen)}>
            חיפוש והחלפה
          </button>
          <button type="button" className="btn btn-small" onClick={() => setFocusMode(true)} disabled={!cur}>
            מסך מלא לשלב הנוכחי
          </button>
          <button type="button" className="btn btn-small" onClick={openVersions}>
            גרסאות
          </button>
          <button type="button" className="btn btn-small" onClick={() => setSearchOpen(true)} disabled={!cur}>
            חיפוש מתודה
          </button>
          <button type="button" className="btn btn-small" onClick={() => setPrefsOpen(true)}>
            המתודות שלי
          </button>
          <button type="button" className="btn btn-small" aria-pressed={gapsOn} onClick={() => setGapsOn(!gapsOn)}>
            {gapsOn ? "הסתרת מה חסר" : "הצגת מה חסר"}
          </button>
          <button type="button" className="btn btn-small" onClick={copyText}>
            העתקה כטקסט
          </button>
          <button type="button" className="btn btn-small" onClick={() => setImportOpen(true)}>
            הדבקת טקסט לשלבים
          </button>
          <button type="button" className="btn btn-small" onClick={() => setPrepOpen(true)}>
            דף הכנה
          </button>
          <button type="button" className="btn btn-small" onClick={() => setLogOpen(true)}>
            יומן הרצות ({(state.meta.runs ?? []).length})
          </button>
          <button type="button" className="btn btn-small" onClick={() => setQOpen(true)} disabled={!cur}>
            שאלות לדיון
          </button>
          <button type="button" className="btn btn-small" onClick={() => setStagesOpen(true)}>
            שלבים ממסמך אחר
          </button>
          <button type="button" className="btn btn-small" onClick={() => setFin("stations")} disabled={!cur}>
            חישוב תחנות
          </button>
          <button type="button" className="btn btn-small" onClick={() => setFin("backup")}>
            תוכנית גיבוי
          </button>
          <button type="button" className="btn btn-small" onClick={() => setFin("ready")}>
            מוכנות להעברה
          </button>
          <button type="button" className="btn btn-small" onClick={() => setFin("tribe")} disabled={!cur}>
            מתודות השבט
          </button>
          <button type="button" className="btn btn-small" onClick={() => setMoreOpen(true)}>
            כלים נוספים
          </button>
          <TourButton kind="write" />
          <button type="button" className="btn btn-small" onClick={printSummary}>
            דף מדריך להדפסה
          </button>
          <button type="button" className="btn btn-small" onClick={() => setKeysOpen(true)}>
            קיצורי מקלדת
          </button>
          <button type="button" className="btn btn-small" onClick={() => setSearchAllOpen(true)}>
            חיפוש בכל המסמכים
          </button>
          <button type="button" className="btn btn-small" onClick={() => setGroupsOpen(true)}>
            חלוקה לקבוצות
          </button>
          <button type="button" className="btn btn-small" onClick={() => setParentsOpen(true)}>
            הודעה להורים
          </button>
          <button type="button" className="btn btn-small" onClick={downloadIcs}>
            קובץ יומן (ICS)
          </button>
          <label className="write-preset">
            <span className="sr-only">הוספת שלב מוכן</span>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) addPreset(e.target.value);
              }}
            >
              <option value="">הוספת שלב מוכן…</option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-small" onClick={() => setComOpen(true)}>
            הערות מבקרים{comCount ? ` (${comCount})` : ""}
          </button>
          {user?.role === "ADMIN" && (
            <button type="button" className="btn btn-small" onClick={publishTribe}>
              פרסום כתבנית שבט
            </button>
          )}
          <button type="button" className="btn btn-small" onClick={autoMinutes}>
            חלוקת זמן אוטומטית
          </button>
          <button type="button" className="btn btn-small" onClick={() => setReadOpen(true)}>
            קריאוּת והצעות לשם
          </button>
          <button type="button" className="btn btn-small" onClick={() => setSnipOpen(true)} disabled={!cur}>
            קטעים שמורים
          </button>
          <button type="button" className="btn btn-small" onClick={() => setRunOn(true)} disabled={!state.blocks.length}>
            מצב הרצה
          </button>
          <button type="button" className="btn btn-small" onClick={printCards}>
            כרטיסי הדפסה לשלבים
          </button>
          <button type="button" className="btn btn-small" onClick={() => setShareOpen(true)}>
            שיתוף בקישור
          </button>
          <button type="button" className="btn btn-small btn-primary" onClick={() => setExportOpen(true)}>
            ייצוא ושיתוף
          </button>
          <button type="button" className="btn btn-small btn-primary" onClick={toAssistant}>
            בדיקה בעוזר הכתיבה
          </button>
        </div>
        <p className="hint" role="status">
          {words} מילים · זמן הקראה בערך {readAloud(words)} ·{" "}
          {target ? (
            diff === 0 ? (
              <span>השלבים מסתכמים ב-{total} דקות, כמו המשך המתוכנן</span>
            ) : diff > 0 ? (
              <strong>השלבים מסתכמים ב-{total} דקות, חורגים ב-{diff} דקות מהמשך המתוכנן</strong>
            ) : (
              <span>
                השלבים מסתכמים ב-{total} דקות, נשארו {-diff} דקות לתכנון
              </span>
            )
          ) : (
            <span>השלבים מסתכמים ב-{total} דקות</span>
          )}{" "}
          · {doneCount} מתוך {state.blocks.length} שלבים מסומנים כמוכנים{endClock ? ` · הפעולה מסתיימת בערך בשעה ${endClock}` : ""}
        </p>
        {total > 0 && (
          <div className="write-timeline" aria-hidden="true">
            {state.blocks.map((b) => (
              <span key={b.id} className={`kind-${b.kind}`} style={{ flexGrow: b.minutes ?? 0 }} title={`${b.title || KIND_LABEL[b.kind]}: ${b.minutes ?? 0} דק'`} />
            ))}
          </div>
        )}
        {target !== total && total > 0 && (
          <button type="button" className="btn btn-small" onClick={() => h.set((s) => ({ ...s, meta: { ...s.meta, minutes: total } }))}>
            לקבוע את המשך המתוכנן ל-{total} דקות
          </button>
        )}
      </div>

      {gapsOn && (
        <GapsPanel
          snap={state}
          token={token}
          onSuggest={(id) => setHelpFor(id)}
          onAdd={(kind) => {
            if (kind === "close") addAfter(state.blocks.length - 1, "close");
            else if (kind === "open") {
              const b = emptyBlock("open");
              h.set((s) => ({ ...s, blocks: [b, ...s.blocks] }));
              setActive(0);
            } else addAfter(Math.max(0, state.blocks.length - 2), kind as Kind);
          }}
          onFocus={(id, field) => {
            setActive(Math.max(0, state.blocks.findIndex((b) => b.id === id)));
            window.setTimeout(() => document.getElementById(field === "minutes" ? `wb-min-${id}` : `wb-title-${id}`)?.focus(), 30);
          }}
        />
      )}

      {findOpen && (
        <div className="card glass write-find" role="search" aria-label="חיפוש והחלפה במסמך">
          <Field label="חיפוש" htmlFor="w-find">
            <input
              id="w-find"
              value={find}
              onChange={(e) => {
                setFind(e.target.value);
                setCursor(-1);
                setFindMsg("");
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), next())}
            />
          </Field>
          <Field label="החלפה ב" htmlFor="w-repl">
            <input id="w-repl" value={repl} onChange={(e) => setRepl(e.target.value)} />
          </Field>
          <div className="actions">
            <button type="button" className="btn btn-small" onClick={next}>
              הבא
            </button>
            <button type="button" className="btn btn-small" onClick={replaceOne}>
              החלפה
            </button>
            <button type="button" className="btn btn-small" onClick={replaceAll}>
              החלפת הכול
            </button>
          </div>
          <p className="hint" role="status">
            {find ? `נמצאו ${matches.length} מופעים` : "הקלידו מה לחפש"} {findMsg && `· ${findMsg}`}
          </p>
        </div>
      )}

      <PrepPanel equipment={state.meta.equipment ?? []} review={state.meta.review ?? []} onEquipment={(equipment) => h.set((s) => ({ ...s, meta: { ...s.meta, equipment } }))} onReview={(review) => h.set((s) => ({ ...s, meta: { ...s.meta, review } }))} />
      <SimilarNotice title={state.title} text={flatten(state)} docId={initial.id} token={token} />

      <ol className="write-blocks">
        {state.blocks.map((b, idx) => {
          const isPrev = preview.has(b.id);
          return (
            <li
              key={b.id}
              className={`card glass write-block kind-${b.kind} ${dropAt === idx ? "is-drop" : ""} ${active === idx ? "is-active" : ""}`}
              onDragOver={(e) => {
                if (dragFrom.current === null) return;
                e.preventDefault();
                setDropAt(idx);
              }}
              onDragLeave={() => setDropAt((d) => (d === idx ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragFrom.current;
                dragFrom.current = null;
                setDropAt(null);
                if (from !== null) move(from, idx);
              }}
              onFocusCapture={() => setActive(idx)}
            >
              <h2 className="sr-only">
                שלב {idx + 1}: {b.title || KIND_LABEL[b.kind]}
              </h2>
              <div className="write-head">
                <span
                  className="write-handle"
                  draggable
                  aria-hidden="true"
                  title="גררו כדי לשנות סדר"
                  onDragStart={(e) => {
                    dragFrom.current = idx;
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(idx));
                  }}
                  onDragEnd={() => {
                    dragFrom.current = null;
                    setDropAt(null);
                  }}
                >
                  ⋮⋮
                </span>
                <span className="write-num" aria-hidden="true">
                  {idx + 1}
                </span>
                <Field label="סוג" htmlFor={`wb-kind-${b.id}`} className="write-kind">
                  <select id={`wb-kind-${b.id}`} value={b.kind} onChange={(e) => setBlock(b.id, { kind: e.target.value as Kind })}>
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="כותרת השלב" htmlFor={`wb-title-${b.id}`} className="write-ttl">
                  <input id={`wb-title-${b.id}`} value={b.title} maxLength={120} onChange={(e) => setBlock(b.id, { title: e.target.value }, true)} />
                </Field>
                <Field label="דקות" htmlFor={`wb-min-${b.id}`} className="write-mins">
                  <input id={`wb-min-${b.id}`} type="number" min={0} max={300} dir="ltr" value={b.minutes ?? ""} onChange={(e) => setBlock(b.id, { minutes: e.target.value === "" ? null : Math.max(0, Math.min(300, Math.round(Number(e.target.value)))) }, true)} />
                </Field>
              </div>

              <div className="write-tools" role="toolbar" aria-label={`עיצוב טקסט בשלב ${idx + 1}`}>
                <button type="button" className="btn btn-small" onClick={() => wrap(b.id, "**", "טקסט מודגש")} disabled={isPrev}>
                  <strong>מודגש</strong>
                </button>
                <button type="button" className="btn btn-small" onClick={() => wrap(b.id, "*", "טקסט נטוי")} disabled={isPrev}>
                  <em>נטוי</em>
                </button>
                <button type="button" className="btn btn-small" onClick={() => prefix(b.id, () => "## ")} disabled={isPrev}>
                  כותרת
                </button>
                <button type="button" className="btn btn-small" onClick={() => prefix(b.id, () => "- ")} disabled={isPrev}>
                  רשימה
                </button>
                <button type="button" className="btn btn-small" onClick={() => prefix(b.id, (i) => `${i + 1}. `)} disabled={isPrev}>
                  ממוספרת
                </button>
                <button type="button" className="btn btn-small" onClick={() => prefix(b.id, () => "> ")} disabled={isPrev}>
                  ציטוט
                </button>
                <button type="button" className="btn btn-small" onClick={() => table(b.id)} disabled={isPrev}>
                  טבלה
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  aria-pressed={isPrev}
                  onClick={() =>
                    setPreview((p) => {
                      const n = new Set(p);
                      if (n.has(b.id)) n.delete(b.id);
                      else n.add(b.id);
                      return n;
                    })
                  }
                >
                  {isPrev ? "חזרה לכתיבה" : "תצוגה מקדימה"}
                </button>
              </div>

              {isPrev ? (
                <div className="write-preview" tabIndex={0} role="region" aria-label={`תצוגה מקדימה של שלב ${idx + 1}`}>
                  <Md text={b.text} />
                </div>
              ) : (
                <>
                  <label htmlFor={`wb-text-${b.id}`} className="sr-only">
                    טקסט השלב {idx + 1}
                  </label>
                  <textarea id={`wb-text-${b.id}`} className="write-text" value={b.text} placeholder={b.hint || "כתבו כאן"} onChange={(e) => setBlock(b.id, { text: e.target.value }, true)} rows={Math.max(5, Math.min(18, b.text.split("\n").length + 2))} />
                </>
              )}

              <details className="write-note">
                <summary>הערה לעצמי{b.note.trim() ? " (יש הערה)" : ""}</summary>
                <label htmlFor={`wb-note-${b.id}`} className="sr-only">
                  הערה אישית לשלב {idx + 1}
                </label>
                <textarea id={`wb-note-${b.id}`} className="write-note-text" value={b.note} maxLength={5000} onChange={(e) => setBlock(b.id, { note: e.target.value }, true)} placeholder="רעיונות, תזכורות, ציוד. ההערה לא נכנסת להעתקה או לייצוא" rows={3} />
              </details>

              {clocks[idx] && <p className="hint write-clock">מתחיל בשעה {clocks[idx]}</p>}
              <div className="actions write-foot">
                <button type="button" className="btn btn-small btn-primary" onClick={() => setHelpFor(b.id)}>
                  עזרה במתודות<span className="sr-only">: שלב {idx + 1}</span>
                </button>
                <button type="button" className="btn btn-small" onClick={() => move(idx, idx - 1)} disabled={idx === 0}>
                  הזזה למעלה<span className="sr-only">: שלב {idx + 1}</span>
                </button>
                <button type="button" className="btn btn-small" onClick={() => move(idx, idx + 1)} disabled={idx === state.blocks.length - 1}>
                  הזזה למטה<span className="sr-only">: שלב {idx + 1}</span>
                </button>
                {dict.supported && (
                  <button type="button" className="btn btn-small" aria-pressed={dictId === b.id && dict.on} onClick={() => toggleDict(b.id)}>
                    {dictId === b.id && dict.on ? "עצירת הכתבה" : "הכתבה בקול"}
                    <span className="sr-only">: שלב {idx + 1}</span>
                  </button>
                )}
                <label className="check-inline">
                  <input type="checkbox" checked={!!b.done} onChange={(e) => setBlock(b.id, { done: e.target.checked })} />
                  השלב מוכן<span className="sr-only">: שלב {idx + 1}</span>
                </label>
                <button type="button" className="btn btn-small" onClick={() => duplicate(idx)}>
                  שכפול השלב<span className="sr-only">: שלב {idx + 1}</span>
                </button>
                <button type="button" className="btn btn-small" onClick={() => splitAtCursor(idx)}>
                  פיצול במיקום הסמן<span className="sr-only">: שלב {idx + 1}</span>
                </button>
                <button type="button" className="btn btn-small" onClick={() => addAfter(idx, "free")}>
                  שלב חדש מתחת<span className="sr-only">: שלב {idx + 1}</span>
                </button>
                <button type="button" className="btn btn-small" onClick={() => remove(idx)}>
                  מחיקת השלב<span className="sr-only">: שלב {idx + 1}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="card glass write-add">
        <Field label="סוג השלב החדש" htmlFor="w-addkind">
          <select id="w-addkind" value={addKind} onChange={(e) => setAddKind(e.target.value as Kind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <button type="button" className="btn btn-primary" onClick={() => addAfter(state.blocks.length - 1, addKind)}>
          הוספת שלב בסוף
        </button>
      </div>

      {focusMode && cur && (
        <div className="assist-focus no-print" role="dialog" aria-modal="true" aria-label="מצב כתיבה במסך מלא">
          <div className="assist-focus-bar">
            <label htmlFor="wf-title">כותרת השלב</label>
            <input id="wf-title" style={{ width: "16rem" }} value={cur.title} onChange={(e) => setBlock(cur.id, { title: e.target.value }, true)} />
            <span>
              שלב {Math.min(active, state.blocks.length - 1) + 1} מתוך {state.blocks.length}
            </span>
            <button type="button" className="btn btn-small" onClick={() => setActive(Math.max(0, active - 1))} disabled={active <= 0}>
              השלב הקודם
            </button>
            <button type="button" className="btn btn-small" onClick={() => setActive(Math.min(state.blocks.length - 1, active + 1))} disabled={active >= state.blocks.length - 1}>
              השלב הבא
            </button>
            <button type="button" className="btn btn-small" onClick={h.undo} disabled={!h.canUndo}>
              ביטול
            </button>
            <span className="hint" role="status">
              {statusText}
            </span>
            <button type="button" className="btn btn-small btn-primary" onClick={() => setFocusMode(false)} autoFocus>
              יציאה (Esc)
            </button>
          </div>
          <label htmlFor="wf-text" className="sr-only">
            טקסט השלב
          </label>
          <textarea id="wf-text" className="assist-focus-text" value={cur.text} onChange={(e) => setBlock(cur.id, { text: e.target.value }, true)} />
        </div>
      )}

      <PrintSheet snap={state} />
      <SearchAllModal open={searchAllOpen} onClose={() => setSearchAllOpen(false)} token={token} />
      <GroupsModal open={groupsOpen} onClose={() => setGroupsOpen(false)} size={state.meta.groupSize} />
      <ParentsModal open={parentsOpen} onClose={() => setParentsOpen(false)} snap={state} token={token} />
      <SummarySheet snap={state} />
      <RunLogModal open={logOpen} onClose={() => setLogOpen(false)} runs={state.meta.runs ?? []} onChange={(runs) => h.set((s) => ({ ...s, meta: { ...s.meta, runs } }))} />
      <StationsModal open={fin === "stations"} onClose={() => setFin("")} token={token} total={state.meta.minutes ?? 0} onInsert={(t) => cur && insertText(cur.id, t, "cursor")} />
      <BackupPlanModal open={fin === "backup"} onClose={() => setFin("")} token={token} snap={state} onAddStage={(title, text) => h.set((st) => ({ ...st, blocks: [...st.blocks, { ...emptyBlock("free"), title, text }].slice(0, 60) }))} />
      <ReadinessModal open={fin === "ready"} onClose={() => setFin("")} token={token} snap={state} />
      <TribeMethodsModal open={fin === "tribe"} onClose={() => setFin("")} token={token} onInsert={(t) => cur && insertText(cur.id, t, "cursor")} />
      <QuestionsModal open={qOpen} onClose={() => setQOpen(false)} token={token} value={state.meta.value ?? ""} age={state.meta.ageGroup} onInsert={(t) => cur && insertText(cur.id, t, "cursor")} />
      <ImportStagesModal open={stagesOpen} onClose={() => setStagesOpen(false)} token={token} currentId={initial.id} onApply={(bs) => h.set((st) => ({ ...st, blocks: [...st.blocks, ...bs.map((b) => ({ ...b, id: newBlockId(), done: false }))].slice(0, 60) }))} />
      <MoreToolsModal open={moreOpen} onClose={() => setMoreOpen(false)} snap={state} docId={initial.id} token={token} onInsert={(t) => cur && insertText(cur.id, t, "cursor")} onOpened={(id) => router.push(`/write/${id}`)} onTool={(t) => { setMoreOpen(false); setTool(t); }} />
      <VoiceCheckModal open={tool === "voice"} onClose={() => setTool("")} snap={state} token={token} />
      <SafetyModal open={tool === "safety"} onClose={() => setTool("")} snap={state} token={token} onAddStage={(title, text) => h.set((st) => ({ ...st, blocks: [...st.blocks, { ...emptyBlock("free"), title, text }].slice(0, 60) }))} />
      <AgeAdaptModal open={tool === "age"} onClose={() => setTool("")} snap={state} token={token} docId={initial.id} onOpened={(id) => router.push(`/write/${id}`)} />
      <MapModal open={tool === "map"} onClose={() => setTool("")} docId={initial.id} onInsert={(t) => cur && insertText(cur.id, t, "append")} />
      <ReadAloudModal open={tool === "read"} onClose={() => setTool("")} snap={state} block={cur} />
      <PracticeModal open={tool === "practice"} onClose={() => setTool("")} block={cur} />
      <StoryQuizModal open={tool === "story"} onClose={() => setTool("")} snap={state} token={token} onInsert={(t) => cur && insertText(cur.id, t, "append")} />
      <PrintablesModal open={tool === "print"} onClose={() => setTool("")} snap={state} token={token} />
      <IllustrationsModal open={tool === "illus"} onClose={() => setTool("")} onInsert={(t) => cur && insertText(cur.id, t, "append")} />
      <HolidayModal open={tool === "holiday"} onClose={() => setTool("")} token={token} onAdd={(bs) => h.set((st) => ({ ...st, blocks: [...st.blocks, ...bs].slice(0, 60) }))} />
      <MergeModal open={tool === "merge"} onClose={() => setTool("")} token={token} currentId={initial.id} blocks={state.blocks} onApply={(bs) => h.set((st) => ({ ...st, blocks: bs }))} />
      <ViewersModal open={tool === "viewers"} onClose={() => setTool("")} token={token} docId={initial.id} blocks={state.blocks} />
      <VoiceNotesModal open={tool === "vnotes"} onClose={() => setTool("")} docId={initial.id} block={cur} />
      <HooksModal open={tool === "hooks"} onClose={() => setTool("")} token={token} snap={state} onInsert={(t) => cur && insertText(cur.id, t, "append")} />
      <ParticipationModal open={tool === "meter"} onClose={() => setTool("")} docId={initial.id} />
      <GameRulesModal open={tool === "rules"} onClose={() => setTool("")} token={token} onInsert={(t) => cur && insertText(cur.id, t, "append")} />
      <TranslateModal open={tool === "translate"} onClose={() => setTool("")} token={token} snap={state} />
      <SeriesModal open={tool === "series"} onClose={() => setTool("")} token={token} snap={state} onInsert={(t) => cur && insertText(cur.id, t, "append")} onOpened={(id) => router.push(`/write/${id}`)} />
      <ToolboxModal open={tool === "box51"} onClose={() => setTool("")} snap={state} token={token} docId={initial.id} onInsert={(t) => cur && insertText(cur.id, t, "append")} />
      <StageModeModal open={tool === "stage"} onClose={() => setTool("")} blocks={state.blocks} />
      <StageQuestionsModal open={tool === "questions"} onClose={() => setTool("")} block={cur} snap={state} token={token} onInsert={(t) => cur && insertText(cur.id, t, "append")} />
      <ShortcutsModal open={keysOpen} onClose={() => setKeysOpen(false)} />
      {runOn && <RunMode snap={state} onClose={() => setRunOn(false)} />}
      <SnippetsModal open={snipOpen} onClose={() => setSnipOpen(false)} token={token} current={cur?.text ?? ""} onInsert={(t) => cur && insertText(cur.id, t, "cursor")} />
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} docId={initial.id} token={token} />
      <ReadabilityModal open={readOpen} onClose={() => setReadOpen(false)} snap={state} token={token} onTitle={(t) => h.set((s) => ({ ...s, title: t }))} onClean={cleanAll} />
      <CommentsModal open={comOpen} onClose={() => setComOpen(false)} docId={initial.id} token={token} onCount={setComCount} titleOf={(id) => { const b = state.blocks.find((x) => x.id === id); return b ? b.title || KIND_LABEL[b.kind] : "שלב שנמחק"; }} />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} snap={state} token={token} docId={initial.id} />
      <PrepModal open={prepOpen} onClose={() => setPrepOpen(false)} snap={state} token={token} />
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        token={token}
        onApply={(blocks, mode) =>
          h.set((st) => {
            const fresh = blocks.map((b) => ({ ...b, id: newBlockId() }));
            const keep = mode === "append" ? st.blocks.filter((b, i, a) => !(a.length === 1 && !b.text.trim() && !b.title.trim())) : [];
            return { ...st, blocks: [...keep, ...fresh].slice(0, 60) };
          })
        }
      />
      <HelpModal open={helpFor !== null} onClose={() => setHelpFor(null)} snap={state} blockId={helpFor} token={token} onInsert={insertText} />
      <PrefsModal open={prefsOpen} onClose={() => setPrefsOpen(false)} token={token} cat={cat} />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} token={token} blockId={cur?.id ?? null} onInsert={insertText} />

      <Modal open={verOpen} onClose={() => setVerOpen(false)} title="גרסאות קודמות" wide footer={<button type="button" className="btn" onClick={() => setVerOpen(false)}>סגירה</button>}>
        <p className="hint">האתר שומר גרסה אוטומטית לכל היותר פעם בשעה, ועד 100 גרסאות. אפשר גם ליצור נקודת שמירה ידנית לפני שינוי גדול.</p>
        <div className="inline-form">
          <Field label="שם לנקודת שמירה (לא חובה)" htmlFor="w-label">
            <input id="w-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <button type="button" className="btn" onClick={savePoint}>
            יצירת נקודת שמירה עכשיו
          </button>
        </div>
        {verView ? (
          <div>
            <h3 className="subtitle">{verView.title}</h3>
            <div className="write-ver-text" tabIndex={0} role="region" aria-label="תוכן הגרסה">
              {verView.text || "הגרסה ריקה"}
            </div>
            <details className="write-diff">
              <summary>הצגת השינויים מול המסמך הנוכחי (מילים)</summary>
              <p className="hint">ירוק: נוסף במסמך הנוכחי. אדום עם קו: היה בגרסה הישנה ונמחק.</p>
              <p className="write-diff-text">
                {wordDiff(flatten(verView.snap), flatten(state)).map((p, n) => (p.k === "same" ? <span key={n}>{p.t}</span> : p.k === "add" ? <ins key={n}>{p.t}</ins> : <del key={n}>{p.t}</del>))}
              </p>
            </details>
            <StageCompare current={state} old={verView.snap} onRestoreStage={restoreStage} />
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={() => restore(verView.id)}>
                שחזור הגרסה הזו
              </button>
              <button type="button" className="btn" onClick={() => setVerView(null)}>
                חזרה לרשימה
              </button>
            </div>
          </div>
        ) : versions === null ? (
          <p>טוען...</p>
        ) : versions.length === 0 ? (
          <p>עוד אין גרסאות. הן נוצרות אחרי השמירה הראשונה, או בנקודת שמירה ידנית.</p>
        ) : (
          <ul className="plain-list">
            {versions.map((v) => (
              <li key={v.id}>
                <span>
                  <strong>{fmtDate(v.savedAt)}</strong> · {v.note || "אוטומטי"} · {v.words} מילים
                </span>
                <button type="button" className="btn btn-small" onClick={() => viewVersion(v)}>
                  צפייה<span className="sr-only">: {fmtDate(v.savedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
