"use client";

// שלב 70: עריכת צוות בעורך. פאנל "עריכה משותפת" (מי מחובר ובאיזה שלב, הזמנת עורכים) וסימון שלבים שאחרים נמצאים בהם.
// השמות הם שמות המדריכים (מבוגרים) בלבד. חניכים ופרטיהם לא מופיעים כאן.
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { LivePerson, LiveState } from "@/lib/useTeamLive";
import type { Block } from "../WriteParts";
import { useAuth, useToast } from "../Providers";
import { Field } from "../ui";

interface Editors {
  role: "owner" | "editor";
  max: number;
  owner: { name: string };
  editors: { id: number; displayName: string; username?: string }[];
}

const STATE_TEXT: Record<LiveState, string> = { live: "מחובר בזמן אמת", connecting: "מתחבר...", off: "לא מחובר" };

/** תגיות של מי שנמצא בשלב מסוים (לא כולל אותי) */
export function BlockPeers({ people, me, blockId }: { people: LivePerson[]; me: string; blockId: string }) {
  const here = people.filter((p) => p.block === blockId && p.id !== me);
  if (!here.length) return null;
  return (
    <div className="team70-peers no-print" role="status" aria-label="מדריכים בשלב הזה">
      {here.map((p) => (
        <span key={p.id} className={`team70-chip${p.editing ? " is-typing" : ""}`} style={{ ["--peer" as string]: p.color }}>
          <span className="team70-dot" aria-hidden="true" />
          {p.name}
          <span className="sr-only">{p.editing ? " מקליד/ה בשלב הזה" : " צופה בשלב הזה"}</span>
          <span aria-hidden="true">{p.editing ? " · מקליד/ה" : " · צופה"}</span>
        </span>
      ))}
    </div>
  );
}

export function TeamEdit({ docId, role, active, people, me, state, blocks, activeId, onEditorsChange }: { docId: number; role: "owner" | "editor"; active: boolean; people: LivePerson[]; me: string; state: LiveState; blocks: Block[]; activeId: string | null; onEditorsChange: (n: number) => void }) {
  const { token, user } = useAuth();
  const toast = useToast();
  const [ed, setEd] = useState<Editors | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    api<Editors>(`/api/write/docs/${docId}/editors`, { token })
      .then((e) => {
        setEd(e);
        onEditorsChange(e.editors.length);
      })
      .catch(() => setEd(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, token]);
  useEffect(load, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !name.trim()) return;
    setBusy(true);
    try {
      await api(`/api/write/docs/${docId}/editors`, { method: "POST", token, body: { username: name.trim() } });
      setName("");
      toast("העורך הוזמן. הוא יקבל התראה באתר", { kind: "success" });
      load();
    } catch (err) {
      toast(errorMessage(err), { kind: "error" });
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: number, self: boolean) => {
    if (!token) return;
    if (self && !window.confirm("לעזוב את העריכה המשותפת של המסמך? הוא יישאר אצל הבעלים.")) return;
    try {
      await api(`/api/write/docs/${docId}/editors/${id}`, { method: "DELETE", token });
      if (self) window.location.assign("/write");
      else load();
    } catch (err) {
      toast(errorMessage(err), { kind: "error" });
    }
  };

  const titleOf = (id: string | null) => {
    const i = blocks.findIndex((b) => b.id === id);
    return i < 0 ? "" : blocks[i].title.trim() || `שלב ${i + 1}`;
  };
  const others = people.filter((p) => p.id !== me);
  const clash = others.find((p) => p.editing && p.block && p.block === activeId);
  const count = people.length;

  return (
    <details className="card glass team70 no-print" open={count > 1 || (ed?.editors.length ?? 0) > 0}>
      <summary>
        <span className="section-title">עריכה משותפת</span>
        <span className="team70-count" aria-label={`${count} מחוברים עכשיו`}>
          {count}
        </span>
        <span className={`team70-state is-${state}`} role="status">
          {active ? STATE_TEXT[state] : "אפשר להזמין עורכים"}
        </span>
      </summary>
      <div className="team70-body">
        {clash && (
          <p className="warn-box" role="status">
            {clash.name} מקליד/ה עכשיו בשלב שבו אתם נמצאים. אם שניכם שומרים אותו, יישמר הנוסח של מי ששמר אחרון, והנוסח השני יישמר ב״גרסאות״.
          </p>
        )}
        <ul className="team70-list" aria-label="מי מחובר למסמך">
          {people.length === 0 && <li className="hint">אף אחד לא מחובר כרגע.</li>}
          {people.map((p) => (
            <li key={p.id} style={{ ["--peer" as string]: p.color }}>
              <span className="team70-dot" aria-hidden="true" />
              <strong>{p.name}</strong>
              {p.id === me && <span className="hint"> (אתם)</span>}
              {p.owner && <span className="hint"> · בעלים</span>}
              <span className="hint">{p.block ? ` · בשלב: ${titleOf(p.block) || "?"}${p.editing ? " (מקליד/ה)" : ""}` : " · צופה במסמך"}</span>
            </li>
          ))}
        </ul>
        {ed && (
          <>
            <h3 className="team70-sub">עורכים במסמך ({ed.editors.length}/{ed.max})</h3>
            <ul className="team70-list">
              <li>
                <strong>{ed.owner.name}</strong>
                <span className="hint"> · בעלים</span>
              </li>
              {ed.editors.map((e) => (
                <li key={e.id}>
                  <strong>{e.displayName}</strong>
                  {e.username && <span className="hint"> ({e.username})</span>}
                  {(role === "owner" || e.id === user?.id) && (
                    <button type="button" className="btn btn-small" onClick={() => remove(e.id, e.id === user?.id)}>
                      {e.id === user?.id ? "עזיבה" : "הסרה"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {role === "owner" && ed.editors.length < ed.max && (
              <form onSubmit={invite} className="team70-invite">
                <Field label="הזמנת מדריך/ה לערוך יחד (שם משתמש)" htmlFor="team-invite">
                  <input id="team-invite" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" />
                </Field>
                <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
                  הזמנה
                </button>
              </form>
            )}
          </>
        )}
        <p className="hint">שינויים של אחרים נכנסים לבד תוך שניות. עורכים מוזמנים יכולים לקרוא ולשמור את המסמך; מחיקה, שיתוף וייצוא נשארים לבעלים. החיבור החי נעלם כשהשרת נרדם, ומתחבר שוב לבד.</p>
      </div>
    </details>
  );
}
