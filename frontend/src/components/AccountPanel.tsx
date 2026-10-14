"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, downloadBooklet, errorMessage, fmtDate } from "@/lib/api";
import type { Activity, Run } from "@/lib/types";
import { ChangePassword, LoginForm, RegisterForm, useSignupInfo } from "./AuthForms";
import { useAuth, useToast } from "./Providers";
import type { Collection } from "./CollectionModal";
import { Field, Skeleton } from "./ui";

function MyRuns() {
  const { token } = useAuth();
  const [runs, setRuns] = useState<Run[] | null>(null);
  useEffect(() => {
    api<Run[]>("/api/me/runs", { token })
      .then(setRuns)
      .catch(() => setRuns([]));
  }, [token]);
  return (
    <section aria-labelledby="myruns-title" className="card glass">
      <h2 id="myruns-title" className="section-title">
        ההפעלות שלי
      </h2>
      {runs === null && <Skeleton lines={2} />}
      {runs && runs.length === 0 && <p>עדיין אין רישומים. בעמוד של כל פעולה יש "יומן הפעלות" לרישום מה עבד ומה לשנות.</p>}
      {runs && runs.length > 0 && (
        <ul className="plain-list runs-list">
          {runs.slice(0, 20).map((r) => (
            <li key={r.id}>
              <span>
                <strong>{new Date(`${r.ranOn}T12:00:00`).toLocaleDateString("he-IL")}</strong> · <Link href={`/library/${r.activityId}`}>{r.title}</Link>
                {r.groupLabel ? ` · ${r.groupLabel}` : ""}
                {r.worked ? ` · עבד: ${r.worked}` : ""}
                {r.changeNext ? ` · לשנות: ${r.changeNext}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MyCollections() {
  const { token } = useAuth();
  const toast = useToast();
  const [cols, setCols] = useState<Collection[] | null>(null);
  const [name, setName] = useState("");

  const load = useCallback(() => {
    api<Collection[]>("/api/me/collections", { token })
      .then(setCols)
      .catch(() => setCols([]));
  }, [token]);
  useEffect(load, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/me/collections", { method: "POST", token, body: { name } });
      setName("");
      load();
    } catch (err) {
      toast(errorMessage(err), { kind: "error" });
    }
  };
  const drop = async (c: Collection) => {
    try {
      await api(`/api/collections/${c.id}`, { method: "DELETE", token });
      load();
    } catch (err) {
      toast(errorMessage(err), { kind: "error" });
    }
  };
  const removeItem = async (c: Collection, aid: number) => {
    try {
      await api(`/api/collections/${c.id}/items/${aid}`, { method: "DELETE", token });
      load();
    } catch (err) {
      toast(errorMessage(err), { kind: "error" });
    }
  };
  const booklet = async (c: Collection) => {
    try {
      await downloadBooklet(c.items.map((i) => i.id), c.name);
    } catch (err) {
      toast(errorMessage(err), { kind: "error" });
    }
  };

  return (
    <section aria-labelledby="mycols-title" className="card glass">
      <h2 id="mycols-title" className="section-title">
        האוספים שלי
      </h2>
      <form onSubmit={create} className="inline-form">
        <Field label="אוסף חדש" htmlFor="acct-col-new">
          <input id="acct-col-new" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="למשל: מחזור ז' סתיו" />
        </Field>
        <button type="submit" className="btn btn-primary" disabled={name.trim().length < 2}>
          יצירה
        </button>
      </form>
      {cols === null && <Skeleton lines={2} />}
      {cols && cols.length === 0 && <p>עוד אין אוספים. בכל פעולה יש כפתור "הוספה לאוסף".</p>}
      {cols?.map((c) => (
        <details key={c.id} className="collection">
          <summary>
            {c.name} ({c.items.length})
          </summary>
          {c.items.length === 0 ? (
            <p>האוסף ריק.</p>
          ) : (
            <ul className="plain-list">
              {c.items.map((i) => (
                <li key={i.id}>
                  <Link href={`/library/${i.id}`}>{i.title}</Link>
                  <button type="button" className="btn btn-small" onClick={() => removeItem(c, i.id)} aria-label={`הסרת ${i.title} מהאוסף`}>
                    הסרה
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="actions">
            <button type="button" className="btn btn-small" onClick={() => booklet(c)} disabled={c.items.length === 0}>
              הורדת האוסף כחוברת Word
            </button>
            <button type="button" className="btn btn-small" onClick={() => drop(c)}>
              מחיקת האוסף
            </button>
          </div>
        </details>
      ))}
    </section>
  );
}

function MyActivities() {
  const { token, clear } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Activity[] | null>(null);

  const load = useCallback(() => {
    api<Activity[]>("/api/me/activities", { token })
      .then(setItems)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          clear();
          toast("ההתחברות פגה. יש להתחבר שוב", { kind: "error" });
        } else toast(errorMessage(e), { kind: "error" });
      });
  }, [token, clear, toast]);
  useEffect(load, [load]);

  const restore = async (a: Activity) => {
    try {
      await api(`/api/activities/${a.id}/restore`, { method: "POST", token });
      toast("הפעולה שוחזרה", { kind: "success" });
      load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };

  return (
    <section aria-labelledby="mine-title" className="card glass">
      <h2 id="mine-title" className="section-title">
        הפעולות שלי
      </h2>
      {items === null ? (
        <Skeleton lines={3} />
      ) : items.length === 0 ? (
        <p>
          עוד לא יצרתם פעולות. <Link href="/">אפשר ליצור את הראשונה</Link>. כשאתם מחוברים, כל פעולה שתיצרו תישמר כאן.
        </p>
      ) : (
        <ul className="plain-list">
          {items.map((a) => (
            <li key={a.id}>
              <span>
                {a.status !== "ARCHIVED" ? (
                  <>
                    <Link href={`/library/${a.id}`}>{a.title}</Link>
                    {a.status === "PENDING" && <span className="status-pill"> ממתינה לאישור</span>}
                  </>
                ) : (
                  <>
                    {a.title} <span className="status-pill">נמחקה</span>
                  </>
                )}{" "}
                · {a.durationMin} דק' · {a.ageGroup} · {fmtDate(a.createdAt)}
              </span>
              <span className="actions">
                {a.status !== "ARCHIVED" ? (
                  <>
                    <Link className="btn btn-small" href={`/library/${a.id}`}>
                      פתיחה ועריכה<span className="sr-only"> של {a.title}</span>
                    </Link>
                    <Link className="btn btn-small" href={`/field/${a.id}`}>
                      מצב שטח<span className="sr-only"> של {a.title}</span>
                    </Link>
                  </>
                ) : (
                  <button type="button" className="btn btn-small" onClick={() => restore(a)}>
                    שחזור<span className="sr-only"> של {a.title}</span>
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AccountPanel() {
  const { token, user, ready, clear } = useAuth();
  const toast = useToast();
  const signup = useSignupInfo();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [pwOpen, setPwOpen] = useState(false);

  if (!ready) return <Skeleton lines={3} />;

  if (!token || !user) {
    return (
      <div>
        <div className="tabs" role="group" aria-label="כניסה או הרשמה">
          <button type="button" className="btn" aria-pressed={tab === "login"} onClick={() => setTab("login")}>
            כבר יש לי חשבון
          </button>
          <button type="button" className="btn" aria-pressed={tab === "register"} onClick={() => setTab("register")}>
            הרשמה
          </button>
        </div>
        {tab === "login" ? (
          <LoginForm title="התחברות" hint="התחברות מאפשרת לשמור את הפעולות והסגנון שלכם, ולערוך אותם. אפשר גם להשתמש במחולל בלי חשבון." />
        ) : signup === null ? (
          <Skeleton lines={3} />
        ) : signup.signupOpen ? (
          <RegisterForm needsCode={signup.signupNeedsCode} />
        ) : (
          <section className="card glass narrow">
            <h2 className="section-title">ההרשמה סגורה</h2>
            <p>פנו למנהל המערכת שייצור לכם משתמש.</p>
          </section>
        )}
      </div>
    );
  }

  if (user.mustChangePw) return <ChangePassword />;

  return (
    <>
      <div className="card glass account-head">
        <p className="who">
          מחובר/ת כ-<strong>{user.displayName}</strong> ({user.role === "ADMIN" ? "אדמין" : "מדריך/ה"})
        </p>
        <div className="actions">
          {user.role === "ADMIN" && (
            <Link className="btn" href="/admin">
              ללוח הבקרה
            </Link>
          )}
          <button type="button" className="btn" aria-expanded={pwOpen} onClick={() => setPwOpen(!pwOpen)}>
            החלפת סיסמה
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              clear();
              toast("התנתקתם מהמערכת", { kind: "info" });
            }}
          >
            התנתקות
          </button>
        </div>
      </div>
      {pwOpen && <ChangePassword onDone={() => setPwOpen(false)} />}
      <MyActivities />
      <MyRuns />
      <MyCollections />
      <section className="card glass" aria-labelledby="mystyle-title">
        <h2 id="mystyle-title" className="section-title">
          הסגנון שלי
        </h2>
        <p>
          הסגנון שבחרתם ב<Link href="/">שלב "סגנון כתיבה"</Link> נשמר בחשבון, ונטען אוטומטית בכל פעם שתיצרו פעולה, גם ממכשיר אחר.
        </p>
      </section>
    </>
  );
}
