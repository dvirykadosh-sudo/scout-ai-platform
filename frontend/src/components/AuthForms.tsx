"use client";

import { useEffect, useState } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useAuth, useToast, type SessionUser } from "./Providers";
import Link from "next/link";
import { Field } from "./ui";

interface AuthResponse {
  token: string;
  user: SessionUser;
}

interface Options {
  providers: { email: boolean; phone: boolean };
}
type LoginReply = Partial<AuthResponse> & { needs2fa?: boolean; challenge?: string };
type Mode = "password" | "twofa" | "forgot" | "magic";

export function LoginForm({ title = "התחברות", hint, onDone }: { title?: string; hint?: string; onDone?: (u: SessionUser) => void }) {
  const { setSession } = useAuth();
  const [mode, setMode] = useState<Mode>("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState<Options | null>(null);
  const [fNew, setFNew] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [devHint, setDevHint] = useState("");
  const [captcha, setCaptcha] = useState<{ token: string; question: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  useEffect(() => {
    api<Options>("/api/auth/options")
      .then(setOpts)
      .catch(() => setOpts({ providers: { email: false, phone: false } }));
  }, []);

  const accept = (r: LoginReply) => {
    if (r.needs2fa && r.challenge) {
      setChallenge(r.challenge);
      setCode("");
      setMode("twofa");
      return;
    }
    if (r.token && r.user) {
      setSession(r.token, r.user);
      onDone?.(r.user);
    }
  };

  // כניסה מקישור קסם שנשלח למייל: /account?magic=...
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("magic");
    if (!t) return;
    window.history.replaceState(null, "", window.location.pathname);
    setBusy(true);
    api<LoginReply>("/api/auth/magic/consume", { method: "POST", body: { token: t } })
      .then(accept)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "password") {
      if (!username.trim() || !password) return setError("יש למלא שם משתמש, מייל או טלפון, וסיסמה");
      if (captcha && !captchaAnswer.trim()) return setError("יש לענות על שאלת האבטחה");
      setBusy(true);
      setError("");
      return api<LoginReply>("/api/auth/login", {
        method: "POST",
        body: { username: username.trim(), password, ...(captcha ? { captchaToken: captcha.token, captchaAnswer: captchaAnswer.trim() } : {}) },
      })
        .then((r) => {
          setCaptcha(null);
          setCaptchaAnswer("");
          accept(r);
        })
        .catch((err) => {
          // אחרי כמה ניסיונות כושלים השרת מבקש לפתור שאלה פשוטה
          const f = err instanceof ApiError ? err.fields : undefined;
          if (f?.captchaToken?.[0] && f?.captchaQuestion?.[0]) {
            setCaptcha({ token: f.captchaToken[0], question: f.captchaQuestion[0] });
            setCaptchaAnswer("");
          }
          setError(errorMessage(err));
        })
        .finally(() => setBusy(false));
    }
    if (mode === "twofa") {
      if (code.trim().length < 4) return setError("יש להזין את הקוד");
      return run(async () => accept(await api<LoginReply>("/api/auth/2fa", { method: "POST", body: { challenge, code: code.trim() } })));
    }
    if (mode === "magic") {
      if (!username.trim()) return setError("יש להזין כתובת מייל");
      return run(async () => {
        const r = await api<{ message: string; devToken?: string }>("/api/auth/magic/request", { method: "POST", body: { email: username.trim() } });
        setInfo(r.message);
        if (r.devToken) setDevHint(`מצב פיתוח: ${window.location.origin}/account?magic=${r.devToken}`);
      });
    }
    if (!forgotSent) {
      if (!username.trim()) return setError("יש להזין שם משתמש, מייל או טלפון");
      return run(async () => {
        const r = await api<{ message: string; devCode?: string }>("/api/auth/forgot", { method: "POST", body: { identifier: username.trim() } });
        setInfo(r.message);
        setForgotSent(true);
        if (r.devCode) setDevHint(`מצב פיתוח: הקוד הוא ${r.devCode}`);
      });
    }
    if (fNew.length < 8) return setError("הסיסמה החדשה חייבת להכיל לפחות 8 תווים");
    return run(async () => {
      await api("/api/auth/reset", { method: "POST", body: { identifier: username.trim(), code: code.trim(), newPassword: fNew } });
      setMode("password");
      setForgotSent(false);
      setPassword("");
      setCode("");
      setFNew("");
      setInfo("הסיסמה הוחלפה. אפשר להתחבר עם הסיסמה החדשה.");
    });
  };

  const go = (m: Mode) => {
    setMode(m);
    setError("");
    setInfo("");
    setDevHint("");
    setForgotSent(false);
  };
  const heading = mode === "twofa" ? "אימות דו-שלבי" : mode === "forgot" ? "איפוס סיסמה" : mode === "magic" ? "כניסה בקישור למייל" : title;
  const canSend = !!opts && (opts.providers.email || opts.providers.phone);

  return (
    <form className="card glass narrow" onSubmit={submit} noValidate aria-labelledby="login-title">
      <h2 id="login-title" className="section-title">
        {heading}
      </h2>
      {hint && mode === "password" && <p className="hint">{hint}</p>}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {info && (
        <p className="ok-box" role="status">
          {info}
        </p>
      )}
      {devHint && (
        <p className="hint" dir="auto">
          {devHint}
        </p>
      )}

      {mode === "password" && (
        <>
          <Field label="שם משתמש, מייל או טלפון" htmlFor="login-user">
            <input id="login-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </Field>
          <Field label="סיסמה" htmlFor="login-pass">
            <input id="login-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          {captcha && (
            <Field label={`שאלת אבטחה: ${captcha.question}`} htmlFor="login-captcha" hint="הוגדרה אחרי כמה ניסיונות כושלים, כדי להגן על החשבון">
              <input id="login-captcha" value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)} inputMode="numeric" autoComplete="off" dir="ltr" />
            </Field>
          )}
        </>
      )}
      {mode === "twofa" && (
        <>
          <p>פתחו את אפליקציית האימות והזינו את הקוד בן 6 הספרות. אם אין לכם גישה לאפליקציה, אפשר להזין קוד גיבוי.</p>
          <Field label="קוד אימות" htmlFor="login-2fa">
            <input id="login-2fa" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" inputMode="text" dir="ltr" autoFocus />
          </Field>
        </>
      )}
      {mode === "magic" && (
        <Field label="כתובת המייל" htmlFor="login-magic" hint="נשלח אליה קישור כניסה אם המייל מאומת בחשבון">
          <input id="login-magic" type="email" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="email" dir="ltr" />
        </Field>
      )}
      {mode === "forgot" && (
        <>
          {opts && !canSend && <p className="warn-box">שליחת קודים לא מוגדרת באתר הזה עדיין. פנו למנהל המערכת שיאפס לכם את הסיסמה.</p>}
          <Field label="שם משתמש, מייל או טלפון" htmlFor="forgot-id" hint="הקוד נשלח למייל או לטלפון המאומתים בחשבון">
            <input id="forgot-id" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" disabled={forgotSent} />
          </Field>
          {forgotSent && (
            <>
              <Field label="הקוד שהתקבל" htmlFor="forgot-code">
                <input id="forgot-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" inputMode="numeric" dir="ltr" />
              </Field>
              <Field label="סיסמה חדשה" htmlFor="forgot-new" hint="לפחות 8 תווים">
                <input id="forgot-new" type="password" value={fNew} onChange={(e) => setFNew(e.target.value)} autoComplete="new-password" />
              </Field>
            </>
          )}
        </>
      )}

      <button className="btn btn-primary" disabled={busy}>
        {busy ? "רגע..." : mode === "password" ? "כניסה" : mode === "twofa" ? "אימות" : mode === "magic" ? "שליחת קישור" : forgotSent ? "החלפת סיסמה" : "שליחת קוד"}
      </button>
      <div className="actions">
        {mode === "password" && (
          <>
            <button type="button" className="btn btn-small" onClick={() => go("forgot")}>
              שכחתי סיסמה
            </button>
            {opts?.providers.email && (
              <button type="button" className="btn btn-small" onClick={() => go("magic")}>
                כניסה בקישור למייל
              </button>
            )}
          </>
        )}
        {mode !== "password" && (
          <button type="button" className="btn btn-small" onClick={() => go("password")}>
            חזרה לכניסה
          </button>
        )}
      </div>
    </form>
  );
}

/** 377: משפט-סיסמה אקראי שקל לזכור וקשה לנחש. */
const PW_WORDS = "river amber plum tiger cedar maple falcon lemon orbit pepper canyon meadow ember harbor island jungle kettle lantern marble nectar olive panda quartz raven saddle thunder velvet willow yellow zephyr acorn breeze copper dolphin eagle forest ginger hazel iris jasmine koala lotus mango nutmeg ocean pearl quince robin sage tulip umber violet walnut".split(" ");
export function makePassphrase() {
  const r = new Uint32Array(6);
  crypto.getRandomValues(r);
  return `${[0, 1, 2, 3].map((i) => PW_WORDS[r[i] % PW_WORDS.length]).join("-")}-${10 + (r[4] % 90)}`;
}

export function RegisterForm({ needsCode, inviteCode = "" }: { needsCode: boolean; inviteCode?: string }) {
  const { setSession } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ displayName: "", username: "", password: "", signupCode: "", email: "", phone: "" });
  const [terms, setTerms] = useState(false);
  const [pwHint, setPwHint] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState("");
  const [opened] = useState(() => Date.now());
  const [trap, setTrap] = useState("");
  const [showPw, setShowPw] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  // בדיקת חוזק סיסמה מול השרת (רשימת סיסמאות נפוצות ועוד), אחרי שהמשתמש מפסיק להקליד
  useEffect(() => {
    if (f.password.length < 4) {
      setPwHint([]);
      return;
    }
    const t = setTimeout(() => {
      api<{ ok: boolean; problems: string[] }>("/api/auth/password-check", { method: "POST", body: { password: f.password, username: f.username } })
        .then((r) => setPwHint(r.problems ?? []))
        .catch(() => setPwHint([]));
    }, 500);
    return () => clearTimeout(t);
  }, [f.password, f.username]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (f.displayName.trim().length < 2) er.displayName = "יש להזין שם להצגה";
    if (f.username.trim().length < 3) er.username = "שם משתמש: לפחות 3 תווים";
    if (f.password.length < 8) er.password = "הסיסמה חייבת להכיל לפחות 8 תווים";
    if (needsCode && !inviteCode && !f.signupCode.trim()) er.signupCode = "יש להזין את קוד ההרשמה של השבט";
    if (!terms) er.terms = "כדי להירשם יש לאשר את תנאי השימוש ומדיניות הפרטיות";
    setErrors(er);
    setError("");
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const r = await api<AuthResponse & { pending?: boolean; message?: string }>("/api/auth/register", { method: "POST", body: { ...f, acceptTerms: true, displayName: f.displayName.trim(), username: f.username.trim(), signupCode: f.signupCode.trim(), ...(inviteCode ? { inviteCode } : {}), website: trap, formAge: Date.now() - opened } });
      if (r.pending) {
        setPending(r.message ?? "ההרשמה התקבלה וממתינה לאישור.");
      } else {
        setSession(r.token, r.user);
        toast(`ברוכים הבאים, ${r.user.displayName}`, { kind: "success" });
      }
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        const next: Record<string, string> = {};
        for (const [k, m] of Object.entries(err.fields)) next[k] = m[0];
        setErrors(next);
      }
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  if (pending)
    return (
      <section className="card glass narrow" role="status">
        <h2 className="section-title">ההרשמה התקבלה</h2>
        <p>{pending}</p>
        <p className="hint">כשהחשבון יאושר אפשר להתחבר עם שם המשתמש והסיסמה שבחרתם.</p>
      </section>
    );

  return (
    <form className="card glass narrow" onSubmit={submit} noValidate aria-labelledby="reg-title">
      <h2 id="reg-title" className="section-title">
        הרשמה כמדריך/ה
      </h2>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <Field label="שם להצגה" htmlFor="reg-name" error={errors.displayName} hint="כך יופיע שמכם בפעולות שתיצרו">
        <input id="reg-name" value={f.displayName} onChange={(e) => set("displayName", e.target.value)} autoComplete="name" aria-invalid={!!errors.displayName} aria-describedby={errors.displayName ? "reg-name-err" : undefined} />
      </Field>
      <Field label="שם משתמש" htmlFor="reg-user" error={errors.username} hint="אותיות, ספרות, נקודה, מקף וקו תחתון">
        <input id="reg-user" value={f.username} onChange={(e) => set("username", e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" aria-invalid={!!errors.username} aria-describedby={errors.username ? "reg-user-err" : undefined} />
      </Field>
      <Field label="סיסמה" htmlFor="reg-pass" error={errors.password} hint={pwHint.length ? `כדאי לשפר: ${pwHint.join(", ")}` : "לפחות 8 תווים"}>
        <input id="reg-pass" type={showPw ? "text" : "password"} value={f.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby={errors.password ? "reg-pass-err" : undefined} />
      </Field>
      <div className="actions">
        <button type="button" className="btn btn-small" onClick={() => { set("password", makePassphrase()); setShowPw(true); }}>הצעת סיסמה חזקה</button>
        {showPw && <button type="button" className="btn btn-small" onClick={() => setShowPw(false)}>הסתרת הסיסמה</button>}
      </div>
      {showPw && <p className="hint">שמרו את הסיסמה במקום בטוח. אפשר לערוך אותה בשדה.</p>}
      <div className="hp-field" aria-hidden="true">
        <label htmlFor="reg-website">אל תמלאו שדה זה</label>
        <input id="reg-website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
      </div>
      <Field label="מייל (לא חובה)" htmlFor="reg-email" error={errors.email} hint="מאפשר כניסה עם המייל ואיפוס סיסמה. אימות המייל נעשה אחרי ההרשמה, במסך החשבון">
        <input id="reg-email" type="email" dir="ltr" value={f.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
      </Field>
      <Field label="טלפון (לא חובה)" htmlFor="reg-phone" error={errors.phone} hint="למשל 050-1234567">
        <input id="reg-phone" type="tel" dir="ltr" value={f.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" />
      </Field>
      {inviteCode && <p className="hint" role="status">נרשמים עם קוד הזמנה. אין צורך בקוד השבט.</p>}
      {needsCode && !inviteCode && (
        <Field label="קוד הרשמה של השבט" htmlFor="reg-code" error={errors.signupCode} hint="את הקוד מקבלים ממנהל השבט">
          <input id="reg-code" value={f.signupCode} onChange={(e) => set("signupCode", e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" aria-invalid={!!errors.signupCode} aria-describedby={errors.signupCode ? "reg-code-err" : undefined} />
        </Field>
      )}
      <div className="field">
        <label className="check" htmlFor="reg-terms">
          <input id="reg-terms" type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} aria-invalid={!!errors.terms} aria-describedby={errors.terms ? "reg-terms-err" : undefined} />
          <span>
            קראתי ואני מאשר/ת את <Link href="/privacy">תנאי השימוש ומדיניות הפרטיות</Link> (כולל שמירת כתובת IP לצורכי אבטחה)
          </span>
        </label>
        {errors.terms && (
          <p id="reg-terms-err" className="error-text" role="alert">
            {errors.terms}
          </p>
        )}
      </div>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "נרשם..." : "הרשמה"}
      </button>
    </form>
  );
}

export function ChangePassword({ onDone }: { onDone?: () => void }) {
  const { token, user, setSession, clear } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError("הסיסמה החדשה חייבת להכיל לפחות 8 תווים");
    if (next !== again) return setError("הסיסמאות החדשות אינן זהות");
    setBusy(true);
    setError("");
    try {
      const r = await api<{ token: string }>("/api/auth/change-password", { method: "POST", token, body: { currentPassword: current, newPassword: next } });
      if (user) setSession(r.token, { ...user, mustChangePw: false });
      toast("הסיסמה הוחלפה", { kind: "success" });
      onDone?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) clear();
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <form className="card glass narrow" onSubmit={submit} noValidate aria-labelledby="pw-title">
      <h2 id="pw-title" className="section-title">
        החלפת סיסמה
      </h2>
      <p className="hint">{user?.mustChangePw ? "לפני שממשיכים יש להחליף את הסיסמה הזמנית." : "בחרו סיסמה חדשה."}</p>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <Field label="סיסמה נוכחית" htmlFor="pw-cur">
        <input id="pw-cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </Field>
      <Field label="סיסמה חדשה" htmlFor="pw-new" hint="לפחות 8 תווים">
        <input id="pw-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field label="סיסמה חדשה, פעם נוספת" htmlFor="pw-again">
        <input id="pw-again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
      </Field>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "שומר..." : "החלפת סיסמה"}
      </button>
    </form>
  );
}

/** Reads /api/meta for the sign-up settings. */
export function useSignupInfo() {
  const [info, setInfo] = useState<{ signupOpen: boolean; signupNeedsCode: boolean } | null>(null);
  useEffect(() => {
    api<{ signupOpen: boolean; signupNeedsCode: boolean }>("/api/meta")
      .then(setInfo)
      .catch(() => setInfo({ signupOpen: false, signupNeedsCode: false }));
  }, []);
  return info;
}
