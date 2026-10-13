"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, errorMessage, fmtDate } from "@/lib/api";
import type { Activity } from "@/lib/types";
import { ChangePassword, LoginForm, RegisterForm, useSignupInfo } from "./AuthForms";
import { useAuth, useToast } from "./Providers";
import { Skeleton } from "./ui";

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
                {a.status === "PUBLISHED" ? (
                  <Link href={`/library/${a.id}`}>{a.title}</Link>
                ) : (
                  <>
                    {a.title} <span className="status-pill">נמחקה</span>
                  </>
                )}{" "}
                · {a.durationMin} דק' · {a.ageGroup} · {fmtDate(a.createdAt)}
              </span>
              <span className="actions">
                {a.status === "PUBLISHED" ? (
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
