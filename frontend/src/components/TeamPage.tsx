"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useAuth, useToast } from "./Providers";
import { IsraelMap3D } from "./Depth3D2";
import { Field } from "./ui";

interface Ev {
  id: number;
  leader: string;
  title: string;
  date: string;
  ageGroup: string;
  docId: number | null;
  note: string;
  mine: boolean;
}

export function TeamPage() {
  const { token, user, ready } = useAuth();
  const toast = useToast();
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [docs, setDocs] = useState<{ id: number; title: string }[]>([]);
  const [f, setF] = useState({ title: "", date: "", ageGroup: "", docId: "", note: "" });
  const load = useCallback(() => {
    if (!token) return;
    api<Ev[]>("/api/team/events", { token }).then(setEvents).catch((e) => toast(errorMessage(e), { kind: "error" }));
    api<{ id: number; title: string }[]>("/api/write/docs", { token }).then((d) => setDocs(Array.isArray(d) ? d : [])).catch(() => {});
  }, [token, toast]);
  useEffect(load, [load]);
  if (!ready) return null;
  if (!user) return <p>כדי לראות את לוח הצוות צריך <Link href="/account">להתחבר</Link>.</p>;
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/team/events", { method: "POST", token, body: { title: f.title, date: f.date, ageGroup: f.ageGroup, note: f.note, ...(f.docId ? { docId: Number(f.docId) } : {}) } });
      setF({ title: "", date: "", ageGroup: "", docId: "", note: "" });
      toast("נוסף ללוח", { kind: "success" });
      load();
    } catch (er) {
      toast(errorMessage(er), { kind: "error" });
    }
  };
  const del = async (id: number) => {
    try {
      await api(`/api/team/events/${id}`, { method: "DELETE", token });
      load();
    } catch (er) {
      toast(errorMessage(er), { kind: "error" });
    }
  };
  const sub = async (id: number) => {
    try {
      const r = await api<{ text: string }>(`/api/team/events/${id}/substitute`, { token });
      await navigator.clipboard.writeText(r.text);
      toast("הודעה למחליף הועתקה. אפשר להדביק בוואטסאפ.", { kind: "success" });
    } catch (er) {
      toast(errorMessage(er), { kind: "error" });
    }
  };
  return (
    <>
      <IsraelMap3D />
      <form className="card" onSubmit={add} aria-label="הוספת פעולה ללוח">
        <h2>הוספת פעולה שאני מעביר/ה</h2>
        <Field label="שם הפעולה" htmlFor="tm-title">
          <input id="tm-title" required maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="תאריך" htmlFor="tm-date">
          <input id="tm-date" type="date" dir="ltr" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="שכבה (לא חובה)" htmlFor="tm-age">
          <input id="tm-age" maxLength={40} value={f.ageGroup} onChange={(e) => setF({ ...f, ageGroup: e.target.value })} />
        </Field>
        <Field label="צירוף מסמך שלי (לא חובה)" htmlFor="tm-doc">
          <select id="tm-doc" value={f.docId} onChange={(e) => setF({ ...f, docId: e.target.value })}>
            <option value="">בלי מסמך</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>{d.title || "ללא שם"}</option>
            ))}
          </select>
        </Field>
        <Field label="הערה (לא חובה)" htmlFor="tm-note">
          <input id="tm-note" maxLength={200} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
        <button className="btn btn-primary" type="submit">הוספה ללוח</button>
      </form>
      <section aria-labelledby="tm-list" style={{ marginTop: 16 }}>
        <h2 id="tm-list">הפעולות הקרובות של הצוות</h2>
        {events === null ? <p>טוען…</p> : events.length === 0 ? <p>אין עדיין פעולות בלוח.</p> : (
          <ul className="plain-list">
            {events.map((e) => (
              <li key={e.id}>
                <span>
                  <strong>{e.date}</strong> · {e.title}{e.ageGroup ? ` (${e.ageGroup})` : ""} · {e.leader}
                  {e.note ? <><br /><small>{e.note}</small></> : null}
                </span>
                {e.mine && (
                  <span className="actions">
                    {e.docId && <Link className="btn btn-small" href={`/write/${e.docId}`}>פתיחת המסמך</Link>}
                    <button type="button" className="btn btn-small" onClick={() => sub(e.id)}>בקשת מחליף</button>
                    <button type="button" className="btn btn-small" onClick={() => del(e.id)}>מחיקה<span className="sr-only">: {e.title}</span></button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
