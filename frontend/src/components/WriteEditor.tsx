"use client";

// עורך כתיבה חופשי, רעיונות 101–112.
// שלב 75: פורק לרכיבים קטנים (כרטיס שלב, כרטיס פרטים, סרגל כלים, פס מצב, שמירה ושחזור, ווים) כדי שהקלדה בשלב אחד
// תרנדר רק אותו. כאן נשאר הרכבה של הכול והפעולות על המסמך.
import { useRouter } from "next/navigation";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage, fmtDate, storageGet, storageSet } from "@/lib/api";
import { useAuth, useToast } from "./Providers";
import { Field, Modal } from "./ui";
import { ReadabilityModal, RunMode, ShareModal, SnippetsModal, clockTimes, distributeMinutes } from "./WriteMore";
import { GroupsModal, ParentsModal, PrepPanel, SearchAllModal, SimilarNotice, icsFor, presetBlock } from "./WriteMore4";
import { CommentsModal, cleanText, useDictation, wordDiff } from "./WriteMore3";
import { ImportStagesModal, QuestionsModal, RunLogModal, SummarySheet } from "./WriteMore2";
import { BackupPlanModal, ReadinessModal, StationsModal, TribeMethodsModal } from "./WriteFinal";
import { ExportModal, ImportModal, PrepModal, PrintSheet } from "./WriteExtras";
import { MoreToolsModal, OutdoorHint } from "./WriteV36";
import { WritePulse } from "./v21/WritePulse";
import { TeamEdit } from "./v21/TeamEdit";
import { GroupDnaCard } from "./v21/GroupDnaCard";
import { useTeamLive } from "@/lib/useTeamLive";
import type { TransitionGame } from "@/lib/pulse";
import { StageModeModal } from "./Depth3D2";
import { ToolboxModal } from "./WriteV51";
import { StyleLabModal } from "./StyleLab";
import { GameRulesModal, HolidayModal, HooksModal, IllustrationsModal, MergeModal, ParticipationModal, SeriesModal, TranslateModal, ViewersModal, VoiceNotesModal, type V50Tool } from "./WriteV50";
import { MapModal, PracticeModal, PrintablesModal, ReadAloudModal, StoryQuizModal } from "./WriteV47";
import { AgeAdaptModal, SafetyModal, StageQuestionsModal, VoiceCheckModal } from "./WriteV39";
import { GapsPanel, HelpModal, PrefsModal, SearchModal, StageCompare, useCatalog, type InsertFn } from "./WriteHelp";
import { KIND_LABEL, countWords, emptyBlock, newBlockId, flatten, sumMinutes, useHistory, type Block, type Doc, type Kind, type Snap } from "./WriteParts";
import { BlockCard, type BlockApi } from "./WriteBlock";
import { WriteMetaCard, type MetaApi } from "./WriteMetaCard";
import { WriteToolbar } from "./WriteToolbar";
import { StatusBar } from "./WriteStatus";
import { FocusMode } from "./WriteFocus";
import { FindPanel, NotesModal, StyleModal } from "./WriteFind";
import { BlockHistoryModal, SideBySideModal, TrayModal } from "./WriteCompare";
import { ReadMeModal } from "./WriteRead";
import { ConflictBox, LeaveModal, LimitBanner, PrintPreviewModal, RecoverBox, ShortcutsPanel, UncheckedGate } from "./Write75";
import { useDocSync } from "./WriteSync";
import { lockMap, useBlockHistory, useBlockLock, useReorder, useStableApi } from "./WriteHooks75";
import { LIMITS, blocksLeft, exportWarning, moveItem, shortcutAction, slashPlan, stripRange, trayParse, trayPrune, trayPush, trayRestore, type Hit, type LimitProblem, type SlashHit, type SlashId, type StyleIssue, type Trashed, type W75Block } from "@/lib/write75";

// רכיבים כבדים שאינם צריכים להתרנדר בכל הקלדה: הם מקבלים את הנוסח המושהה (useDeferredValue) ופעולות קבועות
const GapsPanelM = memo(GapsPanel);
const WritePulseM = memo(WritePulse);
const SimilarNoticeM = memo(SimilarNotice);
const PrepPanelM = memo(PrepPanel);
const OutdoorHintM = memo(OutdoorHint);
const TeamEditM = memo(TeamEdit);
const SummarySheetM = memo(SummarySheet);

/**
 * חלון סגור לא מורכב בכלל: בלי זה כל אחד מ-45 החלונות רץ מחדש בכל הקלדה. אחרי הסגירה הוא נשאר רגע כדי שהדפדפן
 * יחזיר את המיקוד לכפתור שפתח אותו, ואז יורד מהעץ.
 */
function Gate({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = window.setTimeout(() => setMounted(false), 300);
    return () => window.clearTimeout(t);
  }, [open]);
  return open || mounted ? <>{children}</> : null;
}

interface VersionRow {
  id: number;
  title: string;
  words: number;
  note: string | null;
  savedAt: string;
}

type Dlg = "" | "versions" | "search" | "prefs" | "export" | "import" | "prep" | "snip" | "share" | "readability" | "log" | "q" | "more" | "stages" | "keys" | "comments" | "searchAll" | "groups" | "parents" | "style" | "readMe" | "notes" | "tray" | "printA4" | "history";
interface Cmp {
  left: Snap;
  right: Snap;
  leftLabel: string;
  rightLabel: string;
  restore: boolean;
}

export function WriteEditor({ initial }: { initial: Doc }) {
  const { token, user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const first: Snap = { title: initial.title, meta: initial.meta, blocks: initial.blocks };
  const h = useHistory(first);
  const { state } = h;
  const dState = useDeferredValue(state);
  const role = initial.role ?? "owner";
  const [teamN, setTeamN] = useState(0);
  const team = role === "editor" || teamN > 0;
  const pullT = useRef<number | undefined>(undefined);
  const liveRef = useRef<ReturnType<typeof useTeamLive> | null>(null);
  const sync = useDocSync({ initial, token, h, team, getCid: () => liveRef.current?.getCid() ?? "" });
  const live = useTeamLive({
    docId: initial.id,
    token,
    enabled: team,
    onSaved: (e) => {
      if (e.rev <= sync.rev.current) return;
      window.clearTimeout(pullT.current);
      pullT.current = window.setTimeout(() => void sync.pullRemote(), 400);
    },
  });
  liveRef.current = live;

  const [preview, setPreview] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const focusRef = useRef(false);
  focusRef.current = focusMode;
  const [findOpen, setFindOpen] = useState(false);
  const [dlg, setDlg] = useState<Dlg>("");
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [verView, setVerView] = useState<{ id: number; text: string; title: string; snap: Snap } | null>(null);
  const [helpFor, setHelpFor] = useState<string | null>(null);
  const [histFor, setHistFor] = useState<string | null>(null);
  const [gapsOn, setGapsOn] = useState(true);
  const [runOn, setRunOn] = useState(false);
  const [tool, setTool] = useState<"" | "voice" | "safety" | "age" | "questions" | "map" | "read" | "practice" | "story" | "print" | "stage" | V50Tool>("");
  const [fin, setFin] = useState<"" | "stations" | "backup" | "ready" | "tribe">("");
  const [comCount, setComCount] = useState(0);
  const [dictId, setDictId] = useState<string | null>(null);
  const [gate, setGate] = useState<{ next: () => void } | null>(null);
  const [leave, setLeave] = useState<string | null>(null);
  const [cmp, setCmp] = useState<Cmp | null>(null);
  const [tray, setTray] = useState<Trashed[]>([]);
  const cat = useCatalog(token);
  const [label, setLabel] = useState("");
  const [addKind, setAddKind] = useState<Kind>("free");
  const root = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const blocks = state.blocks;
  const nBlocks = blocks.length;
  const activeIdx = Math.max(0, Math.min(active, nBlocks - 1));
  const cur = blocks[activeIdx];
  const curId = cur?.id ?? null;
  const atLimit = nBlocks >= LIMITS.blocks;
  const limitMsg = `יש כבר ${LIMITS.blocks} שלבים, זה המקסימום. אפשר למזג שלבים קרובים או למחוק שלב שלא צריך`;

  // ───── ביטול לכל שלב, מקומי (שלב 75) ─────
  const setBlock = (id: string, patch: Partial<Block>, coalesce = false) => h.set((s) => ({ ...s, blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }), coalesce);
  const bh = useBlockHistory(initial.id, blocks, (id, v) => setBlock(id, v));
  const undoAny = (inBlock: boolean) => {
    if (inBlock && curId && bh.undo(curId)) return;
    h.undo();
  };
  const redoAny = (inBlock: boolean) => {
    if (inBlock && curId && bh.redo(curId)) return;
    h.redo();
  };

  // ───── מי נועל מה, ונעילה של השלב שאני מקליד בו (פריט 19) ─────
  const locks = useMemo(() => lockMap(live.people, live.me), [live.people, live.me]);
  useBlockLock({
    team,
    docId: initial.id,
    token,
    getCid: () => liveRef.current?.getCid() ?? "",
    curId,
    typing: sync.typing,
    onDenied: (by) => toast(`${by || "מדריך אחר"} מקליד/ה בשלב הזה. השינויים שלכם יתמזגו, ואם שניכם שיניתם את אותו שלב יישמר הנוסח שלכם והאחר ב״גרסאות״.`, { kind: "info" }),
  });
  // מדווחים לצוות באיזה שלב אני נמצא ואם אני מקליד
  const focusLive = live.focus;
  useEffect(() => {
    if (team) focusLive(curId, sync.typing);
  }, [team, curId, sync.typing, focusLive]);

  // ───── שלבים שנמחקו (פריט 17) ─────
  const trayKey = `scout.write.tray.${initial.id}`;
  const trayLoaded = useRef(false);
  useEffect(() => {
    try {
      setTray(trayParse(localStorage.getItem(trayKey), Date.now()));
    } catch {
      /* אחסון חסום */
    }
  }, [trayKey]);
  useEffect(() => {
    if (!trayLoaded.current) {
      trayLoaded.current = true;
      return;
    }
    try {
      localStorage.setItem(trayKey, JSON.stringify(trayPrune(tray, Date.now())));
    } catch {
      /* אחסון חסום */
    }
  }, [tray, trayKey]);

  // ───── עריכה ─────
  // שלב 69: משחק מעבר מהצעת מד הדופק נכנס כשלב רגיל אחרי השלב שנבחר (אפשר לבטל ב"בטל")
  const insertGame = (after: number, g: TransitionGame) => {
    if (atLimit) return toast(limitMsg, { kind: "error" });
    const b: Block = { ...emptyBlock("body"), title: `משחק מעבר: ${g.title}`, minutes: g.minutes, text: g.text };
    h.set((s) => ({ ...s, blocks: [...s.blocks.slice(0, after + 1), b, ...s.blocks.slice(after + 1)] }));
    toast(`נוסף שלב "משחק מעבר: ${g.title}"`, { kind: "success" });
  };
  const textEl = (id: string) => (focusRef.current ? document.getElementById("wf-text") : null) ?? document.getElementById(`wb-text-${id}`);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= nBlocks || from === to) return;
    // אחרי הזזה React מכניס את הצומת מחדש ל-DOM והמיקוד אובד: מחזירים אותו לאותו רכיב
    const ae = document.activeElement as HTMLElement | null;
    const fid = ae?.id ?? "";
    const sel = ae instanceof HTMLTextAreaElement || ae instanceof HTMLInputElement ? ([ae.selectionStart, ae.selectionEnd] as const) : null;
    h.set((s) => ({ ...s, blocks: moveItem(s.blocks, from, to) }));
    setActive(to);
    if (fid)
      window.requestAnimationFrame(() => {
        const el = document.getElementById(fid);
        if (!el || document.activeElement === el) return;
        el.focus();
        if (sel && (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) {
          try {
            el.setSelectionRange(sel[0], sel[1]);
          } catch {
            /* שדה שלא תומך בבחירה */
          }
        }
      });
  };
  const addAfter = (idx: number, kind: Kind) => {
    if (atLimit) return toast(limitMsg, { kind: "error" });
    const b = emptyBlock(kind);
    h.set((s) => ({ ...s, blocks: [...s.blocks.slice(0, idx + 1), b, ...s.blocks.slice(idx + 1)] }));
    setActive(idx + 1);
    window.setTimeout(() => document.getElementById(`wb-title-${b.id}`)?.focus(), 30);
  };
  const remove = (idx: number) => {
    const b = blocks[idx];
    if (!b) return;
    if ((b.text.trim() || b.note.trim()) && !window.confirm("לשלב הזה יש תוכן. למחוק אותו? אפשר לשחזר אותו מ״נמחקו לאחרונה״, או לבטל מיד עם הכפתור 'ביטול'.")) return;
    setTray((t) => trayPush(t, b as W75Block, idx, Date.now()));
    h.set((s) => ({ ...s, blocks: s.blocks.filter((x) => x.id !== b.id) }));
    setActive(Math.max(0, idx - 1));
  };
  const restoreTray = (id: string) => {
    const r = trayRestore(blocks as W75Block[], tray, id);
    if (!r.ok) return toast(r.reason ?? "אי אפשר לשחזר את השלב", { kind: "error" });
    h.set((s) => ({ ...s, blocks: r.blocks as Block[] }));
    setTray(r.tray);
    toast("השלב שוחזר למקומו. אפשר לבטל", { kind: "success" });
  };
  const duplicate = (idx: number) => {
    const src = blocks[idx];
    if (!src) return;
    if (atLimit) return toast(limitMsg, { kind: "error" });
    const copy: Block = { ...src, id: newBlockId(), title: src.title ? `${src.title} (עותק)`.slice(0, LIMITS.blockTitle) : "" };
    h.set((s) => ({ ...s, blocks: [...s.blocks.slice(0, idx + 1), copy, ...s.blocks.slice(idx + 1)] }));
    setActive(idx + 1);
  };
  const splitAtCursor = (idx: number) => {
    const b = blocks[idx];
    if (!b) return;
    const el = document.getElementById(`wb-text-${b.id}`) as HTMLTextAreaElement | null;
    const pos = el?.selectionStart ?? 0;
    if (!el || pos <= 0 || pos >= b.text.length) return toast("הציבו את הסמן בתוך הטקסט, במקום שבו רוצים לפצל", { kind: "error" });
    if (atLimit) return toast(limitMsg, { kind: "error" });
    const second: Block = { ...emptyBlock(b.kind === "open" ? "body" : b.kind), title: b.title ? `${b.title} (המשך)`.slice(0, LIMITS.blockTitle) : "", text: b.text.slice(pos).replace(/^\s+/, "") };
    h.set((s) => ({ ...s, blocks: s.blocks.flatMap((x) => (x.id === b.id ? [{ ...x, text: x.text.slice(0, pos).replace(/\s+$/, "") }, second] : [x])) }));
    setActive(idx + 1);
    toast("השלב פוצל לשניים. אפשר לבטל", { kind: "success" });
  };
  const autoMinutes = () => {
    const goal = state.meta.minutes;
    if (!goal) return toast("קודם קבעו משך מתוכנן", { kind: "error" });
    const parts = distributeMinutes(blocks, goal);
    h.set((s) => ({ ...s, blocks: s.blocks.map((b, i) => ({ ...b, minutes: parts[i] })) }));
    toast(`הזמן חולק בין השלבים: ${parts.join(" + ")} דקות. אפשר לבטל`, { kind: "success" });
  };
  const printWith = (...cls: string[]) => {
    document.body.classList.add(...cls);
    const done = () => {
      document.body.classList.remove(...cls);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.setTimeout(() => window.print(), 50);
  };
  const printCards = () => printWith("printing-write", "printing-cards");
  const printSummary = () => printWith("printing-summary");
  const printSheet = () => {
    setDlg("");
    printWith("printing-write");
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
      await sync.saveNow();
      await api("/api/admin/write-templates", { method: "POST", token, body: { docId: initial.id, title: state.title } });
      toast("פורסם כתבנית שבט", { kind: "success" });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const endClock = (() => {
    const m = /^(\d{2}):(\d{2})$/.exec(state.meta.startTime ?? "");
    const tt = sumMinutes(blocks);
    if (!m || !tt) return "";
    const t = Number(m[1]) * 60 + Number(m[2]) + tt;
    return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  })();
  const addPreset = (id: string) => {
    const b = presetBlock(id);
    if (!b) return;
    if (atLimit) return toast(limitMsg, { kind: "error" });
    h.set((s) => ({ ...s, blocks: [...s.blocks.slice(0, activeIdx + 1), b, ...s.blocks.slice(activeIdx + 1)] }));
    setActive(activeIdx + 1);
    window.setTimeout(() => document.getElementById(`wb-title-${b.id}`)?.focus(), 30);
  };
  const downloadIcs = () => {
    const ics = icsFor(state, sumMinutes(blocks));
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
  const clocks = clockTimes(blocks, state.meta.startTime ?? "");

  // הכנסת הצעה לשלב (115–117). הכול נכנס להיסטוריית הביטול הרגילה.
  const insertText: InsertFn = (id, text, mode, what) => {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    const cur0 = b.text;
    if (mode === "replace-all") return setBlock(id, { text });
    if (mode === "replace-sentence" && what && cur0.includes(what)) return setBlock(id, { text: cur0.replace(what, text) });
    if (mode === "cursor") {
      const el = textEl(id) as HTMLTextAreaElement | null;
      if (el && cur0) {
        const pos = Math.min(el.selectionStart ?? cur0.length, cur0.length);
        const before = cur0.slice(0, pos);
        const after = cur0.slice(pos);
        const pre = before && !before.endsWith("\n") ? "\n" : "";
        const post = after && !after.startsWith("\n") ? "\n" : "";
        return setBlock(id, { text: before + pre + text + post + after });
      }
    }
    setBlock(id, { text: cur0.trim() ? cur0.replace(/\s+$/, "") + "\n\n" + text : text });
  };
  const restoreStage = (id: string, text: string) => {
    setBlock(id, { text });
    toast("טקסט השלב הוחזר. אפשר לבטל עם 'ביטול'", { kind: "success" });
  };

  // עיצוב על הטקסט המסומן (102)
  const edit = (id: string, fn: (v: string, a: number, b: number) => { v: string; a: number; b: number }) => {
    const el = textEl(id) as HTMLTextAreaElement | null;
    if (!el) return;
    const r = fn(el.value, el.selectionStart, el.selectionEnd);
    setBlock(id, { text: r.v });
    window.requestAnimationFrame(() => {
      const e2 = textEl(id) as HTMLTextAreaElement | null;
      e2?.focus();
      e2?.setSelectionRange(r.a, r.b);
    });
  };
  const wrap = (id: string, mark: string, ph: string) =>
    edit(id, (v, a, b) => {
      const sel = v.slice(a, b) || ph;
      return { v: v.slice(0, a) + mark + sel + mark + v.slice(b), a: a + mark.length, b: a + mark.length + sel.length };
    });
  const prefix = (id: string, kind: "h" | "ul" | "ol" | "quote") => {
    const fn = (i: number) => (kind === "h" ? "## " : kind === "ul" ? "- " : kind === "ol" ? `${i + 1}. ` : "> ");
    edit(id, (v, a, b) => {
      const start = v.lastIndexOf("\n", a - 1) + 1;
      let end = v.indexOf("\n", b);
      if (end < 0) end = v.length;
      const lines = v.slice(start, end).split("\n");
      const out = lines.map((l, i) => fn(i) + l.replace(/^(#{1,4}\s+|[-*]\s+|\d+[.)]\s+|>\s?)/, "")).join("\n");
      return { v: v.slice(0, start) + out + v.slice(end), a: start, b: start + out.length };
    });
  };
  const table = (id: string) =>
    edit(id, (v, a, b) => {
      const t = `${a > 0 && v[a - 1] !== "\n" ? "\n" : ""}| כותרת א | כותרת ב |\n|---|---|\n| תא | תא |\n`;
      return { v: v.slice(0, a) + t + v.slice(b), a: a + t.length, b: a + t.length };
    });

  // ───── פקודות / בתוך הטקסט (פריט 5) ─────
  const slash = (id: string, cmd: SlashId, arg: string, hit: SlashHit) => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const plan = slashPlan(cmd, arg);
    if (plan.type === "error") return toast(plan.message, { kind: "error" });
    const cut = stripRange(blocks[idx].text, hit.start, hit.end);
    const caret = () =>
      window.requestAnimationFrame(() => {
        const el = textEl(id) as HTMLTextAreaElement | null;
        if (!el) return;
        el.focus();
        el.setSelectionRange(cut.caret, cut.caret);
      });
    if (plan.type === "add") {
      if (atLimit) return toast(limitMsg, { kind: "error" });
      const nb: Block = { ...emptyBlock(plan.block.kind as Kind), title: plan.block.title, minutes: plan.block.minutes, ...(plan.block.hint ? { hint: plan.block.hint } : {}) };
      h.set((s) => ({ ...s, blocks: s.blocks.flatMap((x) => (x.id === id ? [{ ...x, text: cut.text }, nb] : [x])) }));
      setActive(idx + 1);
      window.setTimeout(() => document.getElementById(`wb-${plan.block.title ? "text" : "title"}-${nb.id}`)?.focus(), 40);
      toast(`נוסף שלב ״${nb.title || KIND_LABEL[nb.kind]}״ מתחת. אפשר לבטל`, { kind: "success" });
    } else if (plan.type === "minutes") {
      setBlock(id, { text: cut.text, minutes: plan.minutes });
      toast(`משך השלב נקבע ל-${plan.minutes} דקות`, { kind: "success" });
      caret();
    } else if (plan.type === "flag") {
      setBlock(id, { text: cut.text, unchecked: true });
      toast("השלב סומן ״טרם נבדק״", { kind: "success" });
      caret();
    } else {
      setBlock(id, { text: cut.text });
    }
  };

  // ───── קיצורי מקלדת (פריט 4): לפי המקש הפיזי, ולכן עובדים גם בעברית ─────
  const goBlock = (i: number) => {
    if (!nBlocks) return;
    const to = Math.max(0, Math.min(nBlocks - 1, i));
    setActive(to);
    if (focusRef.current) return;
    const b = blocks[to];
    window.setTimeout(() => {
      const el = document.getElementById(`wb-text-${b.id}`) ?? document.getElementById(`wb-title-${b.id}`);
      el?.focus();
      el?.scrollIntoView({ block: "center" });
    }, 20);
  };
  const keyApi = useStableApi({
    handle: (e: KeyboardEvent) => {
      if (e.isComposing) return;
      // יעד שאינו אלמנט (window, document, SVG) לא מכיל שום שדה: מתייחסים אליו כרקע העמוד
      const t = e.target instanceof HTMLElement ? e.target : null;
      const typing = !!t && (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t.isContentEditable);
      // גם לחיצה על רווח ריק בעמוד (המיקוד עובר ל-main) נחשבת "בתוך העורך", כדי ש-? יפתח את קיצורי העורך ולא את קיצורי האתר
      const inside = !t || (t === document.body || t === document.documentElement || t.tagName === "MAIN" || !!root.current?.contains(t));
      if (!inside) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (document.querySelector("dialog[open]") && !(ctrl && e.code === "KeyS")) return;
      const r = shortcutAction({ key: e.key, code: e.code, ctrl, alt: e.altKey, shift: e.shiftKey, typing });
      if (!r) return;
      const inBlock = !!t && (focusRef.current || !!t.closest?.(".write-block"));
      const inText = !!t && (t.id === "wf-text" || t.id.startsWith("wb-text-"));
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      switch (r.action) {
        case "save":
          stop();
          void sync.saveNow();
          toast("נשמר", { kind: "success" });
          break;
        case "undo":
          stop();
          undoAny(inBlock);
          break;
        case "redo":
          stop();
          redoAny(inBlock);
          break;
        case "bold":
        case "italic":
          if (inText && curId) {
            stop();
            if (r.action === "bold") wrap(curId, "**", "טקסט מודגש");
            else wrap(curId, "*", "טקסט נטוי");
          }
          break;
        case "newBlock":
          stop();
          addAfter(activeIdx, "free");
          break;
        case "dup":
          stop();
          duplicate(activeIdx);
          break;
        case "moveUp":
          stop();
          move(activeIdx, activeIdx - 1);
          break;
        case "moveDown":
          stop();
          move(activeIdx, activeIdx + 1);
          break;
        case "prevBlock":
          stop();
          goBlock(activeIdx - 1);
          break;
        case "nextBlock":
          stop();
          goBlock(activeIdx + 1);
          break;
        case "goto":
          stop();
          goBlock((r.n ?? 1) - 1);
          break;
        case "find":
          stop();
          setFindOpen(true);
          window.setTimeout(() => document.getElementById("w-find")?.focus(), 30);
          break;
        case "focus":
          stop();
          if (cur) setFocusMode(true);
          break;
        case "preview":
          stop();
          if (curId) togglePreview(curId);
          break;
        case "readAloud":
          stop();
          setDlg("readMe");
          break;
        case "help":
          stop();
          setDlg("keys");
          break;
      }
    },
  });
  useEffect(() => {
    // בשלב הלכידה, כדי שקיצור שהעורך תופס (למשל ?) לא יגיע גם לקיצורי האתר הכלליים ויפתח שני חלונות
    const k = (e: KeyboardEvent) => keyApi.handle(e);
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [keyApi]);

  // ───── יציאה עם שינויים שלא נשמרו, גם בתוך האתר (פריט 17) ─────
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (sync.statusRef.current === "saved" || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      e.preventDefault();
      e.stopPropagation();
      setLeave(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [sync.statusRef]);

  // ───── גרסאות (112) ─────
  const loadVersions = useCallback(() => {
    api<VersionRow[]>(`/api/write/docs/${initial.id}/versions`, { token })
      .then(setVersions)
      .catch((e) => toast(errorMessage(e), { kind: "error" }));
  }, [initial.id, token, toast]);
  const openVersions = async () => {
    setVerView(null);
    setDlg("versions");
    if (sync.statusRef.current === "dirty") await sync.saveNow();
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
      if (sync.statusRef.current === "dirty") await sync.saveNow();
      const d = await api<Doc>(`/api/write/docs/${initial.id}/versions/${id}/restore`, { method: "POST", token, body: {} });
      sync.afterServerReplace(d);
      h.set(() => ({ title: d.title, meta: d.meta, blocks: d.blocks }));
      sync.setSt("saved");
      setDlg("");
      toast("הגרסה שוחזרה", { kind: "success" });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };
  const savePoint = async () => {
    try {
      if (sync.statusRef.current === "dirty") await sync.saveNow();
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
  /** לפני ייצוא, שיתוף או הדפסה: אם יש שלבים ״טרם נבדק״, שואלים */
  const guard = (fn: () => void) => {
    if (exportWarning(blocks as W75Block[])) setGate({ next: fn });
    else fn();
  };

  // ───── קפיצה למקום בשלב (חיפוש, בדיקת סגנון, מגבלות) ─────
  const focusAt = (id: string, field: "title" | "text" | "note", start: number, end: number) => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    setActive(idx);
    setPreview((p) => {
      if (!p.has(id)) return p;
      const n = new Set(p);
      n.delete(id);
      return n;
    });
    // כשהקפיצה באה מתוך חלון (בדיקת סגנון, הערות, מגבלות), החלון עדיין נסגר ומונע מיקוד: מנסים שוב עד שהמיקוד נתפס
    let tries = 0;
    const attempt = () => {
      const el = document.getElementById(`wb-${field}-${id}`) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) return;
      if (field === "note") {
        const d = el.closest("details");
        if (d) d.open = true;
      }
      el.focus();
      if (document.activeElement !== el && tries++ < 15) {
        window.setTimeout(attempt, 60);
        return;
      }
      try {
        el.setSelectionRange(start, end);
      } catch {
        /* שדה בלי בחירה */
      }
      el.scrollIntoView({ block: "center" });
    };
    window.setTimeout(attempt, 30);
  };
  const goHit = (hit: Hit) => focusAt(hit.id, hit.field, hit.start, hit.end);
  const jumpStyle = (i: StyleIssue) => {
    setDlg("");
    focusAt(i.id, "text", i.start, i.end);
  };
  const jumpLimit = (p: LimitProblem) => {
    const b = p.block ? blocks[p.block - 1] : null;
    if (!b) return;
    focusAt(b.id, p.code === "BLOCK_TITLE" ? "title" : p.code === "BLOCK_NOTE" ? "note" : "text", 0, 0);
  };

  const togglePreview = (id: string) =>
    setPreview((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // ───── פעולות קבועות לרכיבים הממוזערים ─────
  const reorder = useReorder(blocks, listRef, move);
  const blockApi: BlockApi = useStableApi({
    setBlock,
    setActive,
    togglePreview,
    wrap,
    prefix,
    table,
    move,
    duplicate,
    split: splitAtCursor,
    addAfter,
    remove,
    help: (id: string) => setHelpFor(id),
    toggleDict,
    slash,
    openHistory: (id: string) => {
      setHistFor(id);
      setDlg("history");
    },
    grab: reorder.grab,
    keyGrab: reorder.keyGrab,
    release: () => {
      // ההזזה במקלדת מעבירה את המיקוד לרגע (הצומת נכנס מחדש): משחררים רק אם המיקוד באמת עבר למקום אחר
      window.setTimeout(() => {
        if (!document.activeElement?.id.startsWith("wb-grab-")) reorder.release();
      }, 150);
    },
  });
  const metaApi: MetaApi = useStableApi({
    setTitle: (v: string) => h.set((s) => ({ ...s, title: v }), true),
    patch: (p: Partial<Snap["meta"]>, coalesce = false) => h.set((s) => ({ ...s, meta: { ...s.meta, ...p } }), coalesce),
  });
  const panelApi = useStableApi({
    suggest: (id: string) => setHelpFor(id),
    add: (kind: string) => {
      if (kind === "close") addAfter(nBlocks - 1, "close");
      else if (kind === "open") {
        if (atLimit) return toast(limitMsg, { kind: "error" });
        const b = emptyBlock("open");
        h.set((s) => ({ ...s, blocks: [b, ...s.blocks] }));
        setActive(0);
      } else addAfter(Math.max(0, nBlocks - 2), kind as Kind);
    },
    focus: (id: string, field: string) => {
      setActive(Math.max(0, blocks.findIndex((b) => b.id === id)));
      window.setTimeout(() => document.getElementById(field === "minutes" ? `wb-min-${id}` : `wb-title-${id}`)?.focus(), 30);
    },
    game: insertGame,
    equipment: (equipment: string[]) => h.set((s) => ({ ...s, meta: { ...s.meta, equipment } })),
    review: (review: string[]) => h.set((s) => ({ ...s, meta: { ...s.meta, review } })),
    openBackup: () => setFin("backup"),
    setTarget: (m: number) => h.set((s) => ({ ...s, meta: { ...s.meta, minutes: m } })),
  });
  const toolbarApi = useStableApi({
    on: (cmd: string) => {
      if (cmd.startsWith("preset:")) return addPreset(cmd.slice(7));
      switch (cmd) {
        case "undo":
          return h.undo();
        case "redo":
          return h.redo();
        case "find":
          setFindOpen((o) => !o);
          return;
        case "focus":
          return setFocusMode(true);
        case "versions":
          return void openVersions();
        case "searchMethod":
          return setDlg("search");
        case "prefs":
          return setDlg("prefs");
        case "gaps":
          return setGapsOn((g) => !g);
        case "copy":
          return guard(() => void copyText());
        case "importText":
          return setDlg("import");
        case "prep":
          return setDlg("prep");
        case "log":
          return setDlg("log");
        case "questions":
          return setDlg("q");
        case "stages":
          return setDlg("stages");
        case "stations":
        case "backup":
        case "ready":
        case "tribe":
          return setFin(cmd);
        case "more":
          return setDlg("more");
        case "printSummary":
          return guard(printSummary);
        case "keys":
          return setDlg("keys");
        case "searchAll":
          return setDlg("searchAll");
        case "groups":
          return setDlg("groups");
        case "parents":
          return setDlg("parents");
        case "ics":
          return downloadIcs();
        case "comments":
          return setDlg("comments");
        case "publishTribe":
          return void publishTribe();
        case "autoMinutes":
          return autoMinutes();
        case "readability":
          return setDlg("readability");
        case "style":
          return setDlg("style");
        case "readMe":
          return setDlg("readMe");
        case "notes":
          return setDlg("notes");
        case "tray":
          return setDlg("tray");
        case "printA4":
          return guard(() => setDlg("printA4"));
        case "snippets":
          return setDlg("snip");
        case "run":
          return setRunOn(true);
        case "printCards":
          return guard(printCards);
        case "share":
          return guard(() => setDlg("share"));
        case "export":
          return guard(() => setDlg("export"));
        case "assistant":
          return toAssistant();
      }
    },
  });

  // ───── נוסחים מושהים לרכיבים כבדים ─────
  const words = useMemo(() => countWords(dState), [dState]);
  const dText = useMemo(() => flatten(dState), [dState]);
  const target = state.meta.minutes;
  const problemsLive = sync.problems;
  const statusText =
    sync.status === "saved"
      ? `נשמר ${new Date(sync.savedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`
      : sync.status === "saving"
        ? "שומר..."
        : sync.status === "dirty"
          ? "יש שינויים, נשמרים בעוד רגע"
          : sync.status === "offline"
            ? "אין חיבור. הטקסט שמור במכשיר ויישמר בשרת כשהחיבור יחזור"
            : sync.status === "conflict"
              ? "המסמך עודכן במקום אחר"
              : sync.status === "limits"
                ? `לא נשמר: ${sync.statusMsg}`
                : `השמירה נכשלה: ${sync.statusMsg}`;
  const left = blocksLeft(nBlocks);

  const openCompare = (c: Cmp) => setCmp(c);
  const rec = sync.recover;

  return (
    <div className="write" ref={root}>
      <p id="w-drag-help" className="sr-only">
        לשינוי סדר: רווח להרמת השלב, חץ למעלה או למטה להזזה, רווח להנחה, Escape לביטול. בעכבר או במגע אפשר לגרור את הידית.
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {reorder.message}
      </p>
      {sync.conflict && (
        <ConflictBox
          onUseServer={() => {
            const c = sync.conflict;
            if (!c) return;
            sync.afterServerReplace(c);
            h.reset({ title: c.title, meta: c.meta, blocks: c.blocks });
            sync.setConflict(null);
            sync.clearBuf();
          }}
          onKeepMine={() => {
            const c = sync.conflict;
            if (!c) return;
            sync.rev.current = c.rev;
            sync.setConflict(null);
            sync.setSt("dirty");
            void sync.flush();
          }}
        />
      )}
      {rec && (
        <RecoverBox
          recover={rec}
          onApply={() => void sync.applyRecovery()}
          onDrop={sync.dropRecovery}
          onCompare={() => {
            if (rec.kind === "conflict") openCompare({ left: rec.theirs, right: rec.mine, leftLabel: "בשרת", rightLabel: "במכשיר", restore: false });
            else if (rec.kind === "merge") openCompare({ left: first, right: rec.snap, leftLabel: "בשרת", rightLabel: "אחרי המיזוג", restore: false });
          }}
        />
      )}
      <LimitBanner problems={problemsLive} onJump={jumpLimit} />

      <WriteMetaCard title={state.title} meta={state.meta} cat={cat} api={metaApi} />

      <OutdoorHintM snap={dState} onOpen={panelApi.openBackup} />
      <StatusBar status={sync.status} statusText={statusText} blocks={dState.blocks} total={blocks.reduce((t, b) => t + (b.minutes ?? 0), 0)} done={blocks.filter((b) => b.done).length} target={target} words={words} endClock={endClock} onSetTarget={panelApi.setTarget} />
      <WriteToolbar on={toolbarApi.on} canUndo={h.canUndo} canRedo={h.canRedo} findOpen={findOpen} gapsOn={gapsOn} hasCur={!!cur} hasBlocks={nBlocks > 0} runs={(state.meta.runs ?? []).length} comCount={comCount} isAdmin={user?.role === "ADMIN"} />

      {gapsOn && <GapsPanelM snap={dState} token={token} onSuggest={panelApi.suggest} onAdd={panelApi.add} onFocus={panelApi.focus} />}

      {findOpen && <FindPanel blocks={blocks} activeId={curId} apply={(next) => h.set((s) => ({ ...s, blocks: next }))} go={goHit} onClose={() => setFindOpen(false)} />}

      <PrepPanelM equipment={state.meta.equipment ?? []} review={state.meta.review ?? []} onEquipment={panelApi.equipment} onReview={panelApi.review} />
      <SimilarNoticeM title={dState.title} text={dText} docId={initial.id} token={token} />

      {token && <TeamEditM docId={initial.id} role={role} active={team} people={live.people} me={live.me} state={live.state} blocks={dState.blocks} activeId={curId} onEditorsChange={setTeamN} />}
      {token && <GroupDnaCard compact />}

      <WritePulseM blocks={dState.blocks} total={sumMinutes(dState.blocks)} onInsert={panelApi.game} />

      <ol className="write-blocks" ref={listRef}>
        {blocks.map((b, idx) => (
          <BlockCard
            key={b.id}
            b={b}
            idx={idx}
            total={nBlocks}
            active={activeIdx === idx}
            preview={preview.has(b.id)}
            dropMark={reorder.drop === idx ? "before" : reorder.drop === nBlocks && idx === nBlocks - 1 ? "after" : null}
            isDragging={reorder.dragging === idx}
            held={reorder.held === b.id}
            clock={clocks[idx]}
            people={live.people}
            me={live.me}
            lockedBy={locks.get(b.id) ?? null}
            dictOn={dictId === b.id && dict.on}
            dictSupported={dict.supported}
            atLimit={atLimit}
            api={blockApi}
          />
        ))}
      </ol>

      <div className="card glass write-add">
        <Field label="סוג השלב החדש" htmlFor="w-addkind">
          <select id="w-addkind" value={addKind} onChange={(e) => setAddKind(e.target.value as Kind)}>
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <button type="button" className="btn btn-primary" onClick={() => addAfter(nBlocks - 1, addKind)} disabled={atLimit} title={atLimit ? limitMsg : undefined}>
          הוספת שלב בסוף
        </button>
        {(left <= 10 || atLimit) && (
          <p className={`hint ${atLimit ? "warn-text" : ""}`} role="status">
            {atLimit ? limitMsg : `אפשר להוסיף עוד ${left} שלבים (המקסימום הוא ${LIMITS.blocks})`}
          </p>
        )}
      </div>

      {focusMode && cur && (
        <FocusMode
          block={cur}
          index={activeIdx}
          total={nBlocks}
          blocks={blocks}
          planned={target}
          statusText={statusText}
          words={words}
          canUndo={bh.canUndo(cur.id) || h.canUndo}
          locked={locks.has(cur.id)}
          onChange={(patch, co) => setBlock(cur.id, patch, co)}
          onPrev={() => setActive(Math.max(0, activeIdx - 1))}
          onNext={() => setActive(Math.min(nBlocks - 1, activeIdx + 1))}
          onUndo={() => undoAny(true)}
          onHelp={() => setDlg("keys")}
          onExit={() => setFocusMode(false)}
        />
      )}

      <PrintSheet snap={dState} />
      <SummarySheetM snap={dState} />
      <Gate open={dlg === "searchAll"}>
        <SearchAllModal open={dlg === "searchAll"} onClose={() => setDlg("")} token={token} />
      </Gate>
      <Gate open={dlg === "groups"}>
        <GroupsModal open={dlg === "groups"} onClose={() => setDlg("")} size={state.meta.groupSize} />
      </Gate>
      <Gate open={dlg === "parents"}>
        <ParentsModal open={dlg === "parents"} onClose={() => setDlg("")} snap={state} token={token} />
      </Gate>
      <Gate open={dlg === "log"}>
        <RunLogModal open={dlg === "log"} onClose={() => setDlg("")} runs={state.meta.runs ?? []} onChange={(runs) => h.set((s) => ({ ...s, meta: { ...s.meta, runs } }))} />
      </Gate>
      <Gate open={fin === "stations"}>
        <StationsModal open={fin === "stations"} onClose={() => setFin("")} token={token} total={state.meta.minutes ?? 0} onInsert={(t) => cur && insertText(cur.id, t, "cursor")} />
      </Gate>
      <Gate open={fin === "backup"}>
        <BackupPlanModal open={fin === "backup"} onClose={() => setFin("")} token={token} snap={state} onAddStage={(title, text) => h.set((st) => ({ ...st, blocks: [...st.blocks, { ...emptyBlock("free"), title, text }].slice(0, LIMITS.blocks) }))} />
      </Gate>
      <Gate open={fin === "ready"}>
        <ReadinessModal open={fin === "ready"} onClose={() => setFin("")} token={token} snap={state} />
      </Gate>
      <Gate open={fin === "tribe"}>
        <TribeMethodsModal open={fin === "tribe"} onClose={() => setFin("")} token={token} onInsert={(t) => cur && insertText(cur.id, t, "cursor")} />
      </Gate>
      <Gate open={dlg === "q"}>
        <QuestionsModal open={dlg === "q"} onClose={() => setDlg("")} token={token} value={state.meta.value ?? ""} age={state.meta.ageGroup} onInsert={(t) => cur && insertText(cur.id, t, "cursor")} />
      </Gate>
      <Gate open={dlg === "stages"}>
        <ImportStagesModal open={dlg === "stages"} onClose={() => setDlg("")} token={token} currentId={initial.id} onApply={(bs) => h.set((st) => ({ ...st, blocks: [...st.blocks, ...bs.map((b) => ({ ...b, id: newBlockId(), done: false }))].slice(0, LIMITS.blocks) }))} />
      </Gate>
      <Gate open={dlg === "more"}>
        <MoreToolsModal
          open={dlg === "more"}
          onClose={() => setDlg("")}
          snap={state}
          docId={initial.id}
          token={token}
          onInsert={(t) => cur && insertText(cur.id, t, "cursor")}
          onOpened={(id) => router.push(`/write/${id}`)}
          onTool={(t) => {
            setDlg("");
            setTool(t);
          }}
        />
      </Gate>
      <Gate open={tool === "voice"}>
        <VoiceCheckModal open={tool === "voice"} onClose={() => setTool("")} snap={state} token={token} />
      </Gate>
      <Gate open={tool === "safety"}>
        <SafetyModal open={tool === "safety"} onClose={() => setTool("")} snap={state} token={token} onAddStage={(title, text) => h.set((st) => ({ ...st, blocks: [...st.blocks, { ...emptyBlock("free"), title, text }].slice(0, LIMITS.blocks) }))} />
      </Gate>
      <Gate open={tool === "age"}>
        <AgeAdaptModal open={tool === "age"} onClose={() => setTool("")} snap={state} token={token} docId={initial.id} onOpened={(id) => router.push(`/write/${id}`)} />
      </Gate>
      <Gate open={tool === "map"}>
        <MapModal open={tool === "map"} onClose={() => setTool("")} docId={initial.id} onInsert={(t) => cur && insertText(cur.id, t, "append")} />
      </Gate>
      <Gate open={tool === "read"}>
        <ReadAloudModal open={tool === "read"} onClose={() => setTool("")} snap={state} block={cur} />
      </Gate>
      <Gate open={tool === "practice"}>
        <PracticeModal open={tool === "practice"} onClose={() => setTool("")} block={cur} />
      </Gate>
      <Gate open={tool === "story"}>
        <StoryQuizModal open={tool === "story"} onClose={() => setTool("")} snap={state} token={token} onInsert={(t) => cur && insertText(cur.id, t, "append")} />
      </Gate>
      <Gate open={tool === "print"}>
        <PrintablesModal open={tool === "print"} onClose={() => setTool("")} snap={state} token={token} />
      </Gate>
      <Gate open={tool === "illus"}>
        <IllustrationsModal open={tool === "illus"} onClose={() => setTool("")} onInsert={(t) => cur && insertText(cur.id, t, "append")} />
      </Gate>
      <Gate open={tool === "holiday"}>
        <HolidayModal open={tool === "holiday"} onClose={() => setTool("")} token={token} onAdd={(bs) => h.set((st) => ({ ...st, blocks: [...st.blocks, ...bs].slice(0, LIMITS.blocks) }))} />
      </Gate>
      <Gate open={tool === "merge"}>
        <MergeModal open={tool === "merge"} onClose={() => setTool("")} token={token} currentId={initial.id} blocks={state.blocks} onApply={(bs) => h.set((st) => ({ ...st, blocks: bs }))} />
      </Gate>
      <Gate open={tool === "viewers"}>
        <ViewersModal open={tool === "viewers"} onClose={() => setTool("")} token={token} docId={initial.id} blocks={state.blocks} />
      </Gate>
      <Gate open={tool === "vnotes"}>
        <VoiceNotesModal open={tool === "vnotes"} onClose={() => setTool("")} docId={initial.id} block={cur} />
      </Gate>
      <Gate open={tool === "hooks"}>
        <HooksModal open={tool === "hooks"} onClose={() => setTool("")} token={token} snap={state} onInsert={(t) => cur && insertText(cur.id, t, "append")} />
      </Gate>
      <Gate open={tool === "meter"}>
        <ParticipationModal open={tool === "meter"} onClose={() => setTool("")} docId={initial.id} />
      </Gate>
      <Gate open={tool === "rules"}>
        <GameRulesModal open={tool === "rules"} onClose={() => setTool("")} token={token} onInsert={(t) => cur && insertText(cur.id, t, "append")} />
      </Gate>
      <Gate open={tool === "translate"}>
        <TranslateModal open={tool === "translate"} onClose={() => setTool("")} token={token} snap={state} />
      </Gate>
      <Gate open={tool === "series"}>
        <SeriesModal open={tool === "series"} onClose={() => setTool("")} token={token} snap={state} onInsert={(t) => cur && insertText(cur.id, t, "append")} onOpened={(id) => router.push(`/write/${id}`)} />
      </Gate>
      <Gate open={tool === "lab53"}>
        <StyleLabModal open={tool === "lab53"} onClose={() => setTool("")} snap={state} token={token} onInsert={(t) => cur && insertText(cur.id, t, "append")} />
      </Gate>
      <Gate open={tool === "box51"}>
        <ToolboxModal open={tool === "box51"} onClose={() => setTool("")} snap={state} token={token} docId={initial.id} onInsert={(t) => cur && insertText(cur.id, t, "append")} />
      </Gate>
      <Gate open={tool === "stage"}>
        <StageModeModal open={tool === "stage"} onClose={() => setTool("")} blocks={state.blocks} />
      </Gate>
      <Gate open={tool === "questions"}>
        <StageQuestionsModal open={tool === "questions"} onClose={() => setTool("")} block={cur} snap={state} token={token} onInsert={(t) => cur && insertText(cur.id, t, "append")} />
      </Gate>
      <ShortcutsPanel open={dlg === "keys"} onClose={() => setDlg("")} />
      {runOn && <RunMode snap={state} onClose={() => setRunOn(false)} />}
      <Gate open={dlg === "snip"}>
        <SnippetsModal open={dlg === "snip"} onClose={() => setDlg("")} token={token} current={cur?.text ?? ""} onInsert={(t) => cur && insertText(cur.id, t, "cursor")} />
      </Gate>
      <Gate open={dlg === "share"}>
        <ShareModal open={dlg === "share"} onClose={() => setDlg("")} docId={initial.id} token={token} />
      </Gate>
      <Gate open={dlg === "readability"}>
        <ReadabilityModal open={dlg === "readability"} onClose={() => setDlg("")} snap={state} token={token} onTitle={(t) => h.set((s) => ({ ...s, title: t }))} onClean={cleanAll} />
      </Gate>
      <CommentsModal
        open={dlg === "comments"}
        onClose={() => setDlg("")}
        docId={initial.id}
        token={token}
        onCount={setComCount}
        titleOf={(id) => {
          const b = blocks.find((x) => x.id === id);
          return b ? b.title || KIND_LABEL[b.kind] : "שלב שנמחק";
        }}
      />
      <Gate open={dlg === "export"}>
        <ExportModal open={dlg === "export"} onClose={() => setDlg("")} snap={state} token={token} docId={initial.id} />
      </Gate>
      <Gate open={dlg === "prep"}>
        <PrepModal open={dlg === "prep"} onClose={() => setDlg("")} snap={state} token={token} />
      </Gate>
      <Gate open={dlg === "import"}>
        <ImportModal
          open={dlg === "import"}
          onClose={() => setDlg("")}
          token={token}
          onApply={(bs, mode) =>
            h.set((st) => {
              const fresh = bs.map((b) => ({ ...b, id: newBlockId() }));
              const keep = mode === "append" ? st.blocks.filter((b, _i, a) => !(a.length === 1 && !b.text.trim() && !b.title.trim())) : [];
              return { ...st, blocks: [...keep, ...fresh].slice(0, LIMITS.blocks) };
            })
          }
        />
      </Gate>
      <Gate open={helpFor !== null}>
        <HelpModal open={helpFor !== null} onClose={() => setHelpFor(null)} snap={state} blockId={helpFor} token={token} onInsert={insertText} />
      </Gate>
      <Gate open={dlg === "prefs"}>
        <PrefsModal open={dlg === "prefs"} onClose={() => setDlg("")} token={token} cat={cat} />
      </Gate>
      <Gate open={dlg === "search"}>
        <SearchModal open={dlg === "search"} onClose={() => setDlg("")} token={token} blockId={cur?.id ?? null} onInsert={insertText} />
      </Gate>

      {/* שלב 75 */}
      <StyleModal open={dlg === "style"} onClose={() => setDlg("")} blocks={blocks} ageGroup={state.meta.ageGroup} onJump={jumpStyle} />
      <NotesModal
        open={dlg === "notes"}
        onClose={() => setDlg("")}
        blocks={blocks}
        onChange={(id, note) => setBlock(id, { note }, true)}
        onJump={(id) => {
          setDlg("");
          focusAt(id, "note", 0, 0);
        }}
      />
      <ReadMeModal open={dlg === "readMe"} onClose={() => setDlg("")} blocks={blocks} activeIdx={activeIdx} onJump={(i) => setActive(i)} />
      <TrayModal open={dlg === "tray"} onClose={() => setDlg("")} tray={tray} onRestore={restoreTray} />
      <BlockHistoryModal
        open={dlg === "history"}
        onClose={() => setDlg("")}
        block={blocks.find((b) => b.id === histFor) ?? null}
        index={Math.max(0, blocks.findIndex((b) => b.id === histFor))}
        list={histFor ? bh.list(histFor) : []}
        onRestore={(i) => {
          if (histFor && bh.restore(histFor, i)) toast("המצב שוחזר. אפשר לבטל", { kind: "success" });
        }}
      />
      <PrintPreviewModal open={dlg === "printA4"} onClose={() => setDlg("")} snap={dState} onPrint={printSheet} />
      <SideBySideModal open={cmp !== null} onClose={() => setCmp(null)} left={cmp?.left ?? null} right={cmp?.right ?? null} leftLabel={cmp?.leftLabel ?? ""} rightLabel={cmp?.rightLabel ?? ""} onRestore={cmp?.restore ? restoreStage : undefined} />
      <UncheckedGate
        open={gate !== null}
        blocks={blocks}
        onClose={() => setGate(null)}
        onContinue={() => {
          const g = gate;
          setGate(null);
          g?.next();
        }}
        onJump={(id) => focusAt(id, "text", 0, 0)}
      />
      <LeaveModal
        open={leave !== null}
        status={sync.status}
        onStay={() => setLeave(null)}
        onLeave={() => {
          const to = leave;
          setLeave(null);
          sync.writeBuf();
          if (to) router.push(to);
        }}
        onSave={async () => {
          const to = leave;
          await sync.saveNow();
          if (sync.statusRef.current === "saved") {
            setLeave(null);
            if (to) router.push(to);
          } else toast("השמירה לא הצליחה, ולכן נשארים בעורך. הנוסח שלכם שמור במכשיר.", { kind: "error" });
        }}
      />

      <Modal open={dlg === "versions"} onClose={() => setDlg("")} title="גרסאות קודמות" wide footer={<button type="button" className="btn" onClick={() => setDlg("")}>סגירה</button>}>
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
              <button type="button" className="btn" onClick={() => openCompare({ left: verView.snap, right: state, leftLabel: verView.title, rightLabel: "הנוכחי", restore: true })}>
                השוואה זה לצד זה
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
