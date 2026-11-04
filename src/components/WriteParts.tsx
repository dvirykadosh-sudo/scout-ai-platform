"use client";

// חלקים משותפים לעורך הכתיבה החופשי (101–112): סוגי שלבים, תצוגת Markdown בטוחה, היסטוריית ביטול.
import { Fragment, useCallback, useRef, useState, type ReactNode } from "react";

export type Kind = "open" | "body" | "peak" | "close" | "free";
export interface Block {
  id: string;
  title: string;
  kind: Kind;
  minutes: number | null;
  text: string;
  note: string;
  hint?: string;
  done?: boolean;
}
export interface Meta {
  ageGroup: string;
  minutes: number | null;
  groupSize?: number | null;
  value?: string;
  gear?: string[];
  leader?: string;
  date?: string;
  pinned?: boolean;
  tags?: string[];
  equipment?: string[];
  review?: string[];
  template?: boolean;
  archived?: boolean;
  runs?: { date: string; note: string; rating: number }[];
  startTime?: string;
}
export interface Snap {
  title: string;
  meta: Meta;
  blocks: Block[];
}
export interface Doc extends Snap {
  id: number;
  rev: number;
  words: number;
  createdAt: string;
  updatedAt: string;
}

export const KIND_LABEL: Record<Kind, string> = { open: "פתיחה", body: "גוף", peak: "שיא", close: "סיכום", free: "חופשי" };
export const KINDS = Object.keys(KIND_LABEL) as Kind[];

export const newBlockId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
export const emptyBlock = (kind: Kind = "free"): Block => ({ id: newBlockId(), title: "", kind, minutes: null, text: "", note: "" });

/** אותה ספירה כמו בשרת: כותרת המסמך, כותרות השלבים והטקסט, בלי ההערות האישיות. */
export const countWords = (s: Snap) => {
  const m = [s.title, ...s.blocks.flatMap((b) => [b.title, b.text])].join(" ").match(/\S+/g);
  return m ? m.length : 0;
};
export const readAloud = (w: number) => {
  const sec = Math.round((w / 130) * 60);
  return sec < 60 ? `${sec} שניות` : `${Math.round(sec / 6) / 10} דקות`;
};
export const sumMinutes = (blocks: Block[]) => blocks.reduce((s, b) => s + (b.minutes ?? 0), 0);

/** טקסט רציף של המסמך (בלי הערות אישיות), להעתקה ולהעברה לעוזר הכתיבה. */
export function flatten(s: Snap): string {
  const parts = [s.title.trim()];
  for (const b of s.blocks) {
    const head = [b.title.trim() || KIND_LABEL[b.kind], b.minutes ? `(${b.minutes} דק')` : ""].filter(Boolean).join(" ");
    parts.push(`${head}\n${b.text.trim()}`.trim());
  }
  return parts.filter(Boolean).join("\n\n");
}

// ───────────── תצוגה בטוחה של עיצוב פשוט ─────────────
// תומך ב: **מודגש**, *נטוי*, ## כותרת, - רשימה, 1. רשימה ממוספרת, > ציטוט, טבלה עם |. בלי HTML גולמי.
function inline(s: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith("**") ? <strong key={`${key}-${i++}`}>{t.slice(2, -2)}</strong> : <em key={`${key}-${i++}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function Md({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    if (/^#{1,4}\s+/.test(l)) {
      nodes.push(
        <p key={k++} className="md-h">
          {inline(l.replace(/^#{1,4}\s+/, ""), `h${k}`)}
        </p>,
      );
      i++;
    } else if (/^\s*[-*]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      nodes.push(
        <ul key={k++}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, `u${k}${j}`)}</li>
          ))}
        </ul>,
      );
    } else if (/^\s*\d+[.)]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      nodes.push(
        <ol key={k++}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, `o${k}${j}`)}</li>
          ))}
        </ol>,
      );
    } else if (/^>\s?/.test(l)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""));
      nodes.push(<blockquote key={k++}>{inline(q.join(" "), `q${k}`)}</blockquote>);
    } else if (isRow(l)) {
      const rows: string[][] = [];
      while (i < lines.length && isRow(lines[i])) rows.push(cells(lines[i++]));
      const sep = rows.length > 1 && rows[1].every((c) => /^:?-{2,}:?$/.test(c));
      const head = sep ? rows[0] : null;
      const body = sep ? rows.slice(2) : rows;
      nodes.push(
        <div key={k++} className="md-table" tabIndex={0} role="region" aria-label="טבלה">
          <table>
            {head && (
              <thead>
                <tr>
                  {head.map((c, j) => (
                    <th key={j} scope="col">
                      {inline(c, `th${k}${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((r, j) => (
                <tr key={j}>
                  {r.map((c, n) => (
                    <td key={n}>{inline(c, `td${k}${j}${n}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else {
      const p: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*]\s|\s*\d+[.)]\s|>)/.test(lines[i]) && !isRow(lines[i])) p.push(lines[i++]);
      nodes.push(
        <p key={k++}>
          {p.map((t, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {inline(t, `p${k}${j}`)}
            </Fragment>
          ))}
        </p>,
      );
    }
  }
  return <div className="md">{nodes.length ? nodes : <p className="hint">אין עדיין טקסט.</p>}</div>;
}

// ───────────── ביטול ושחזור (112) ─────────────
const MAX_HISTORY = 1000;

/** מחזיק את מצב המסמך עם מחסנית ביטול ושחזור. הקלדה ברצף (עד שנייה) נספרת כצעד אחד. */
export function useHistory(initial: Snap) {
  const [state, setState] = useState<Snap>(initial);
  const cur = useRef<Snap>(initial);
  const past = useRef<Snap[]>([]);
  const future = useRef<Snap[]>([]);
  const lastPush = useRef(0);
  const [, bump] = useState(0);

  const commit = (next: Snap) => {
    cur.current = next;
    setState(next);
    bump((n) => n + 1);
  };
  const set = useCallback((fn: (s: Snap) => Snap, coalesce = false) => {
    const prev = cur.current;
    const next = fn(prev);
    if (next === prev) return;
    const now = Date.now();
    if (!(coalesce && now - lastPush.current < 1000 && past.current.length)) {
      past.current.push(prev);
      if (past.current.length > MAX_HISTORY) past.current.shift();
    }
    lastPush.current = now;
    future.current = [];
    commit(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const undo = useCallback(() => {
    const p = past.current.pop();
    if (!p) return;
    future.current.push(cur.current);
    lastPush.current = 0;
    commit(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const redo = useCallback(() => {
    const n = future.current.pop();
    if (!n) return;
    past.current.push(cur.current);
    lastPush.current = 0;
    commit(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** החלפה בלי להיכנס להיסטוריה (טעינה מהשרת). */
  const reset = useCallback((s: Snap) => {
    past.current = [];
    future.current = [];
    commit(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { state, current: cur, set, undo, redo, reset, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
