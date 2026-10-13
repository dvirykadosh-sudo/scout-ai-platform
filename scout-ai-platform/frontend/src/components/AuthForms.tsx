"use client";

import { useEffect, useState } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useAuth, useToast, type SessionUser } from "./Providers";
import { Field } from "./ui";

interface AuthResponse {
  token: string;
  user: SessionUser;
}

export function LoginForm({ title = "התחברות", hint, onDone }: { title?: string; hint?: string; onDone?: (u: SessionUser) => void }) {
  const { setSession } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return setError("יש למלא שם משתמש וסיסמה");
    setBusy(true);
    setError("");
    try {
      const r = await api<AuthResponse>("/api/auth/login", { method: "POST", body: { username: username.trim(), password } });
      setSession(r.token, r.user);
      onDone?.(r.user);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <form className="card glass narrow" onSubmit={submit} noValidate aria-labelledby="login-title">
      <h2 id="login-title" className="section-title">
        {title}
      </h2>
      {hint && <p className="hint">{hint}</p>}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <Field label="שם משתמש" htmlFor="login-user">
        <input id="login-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
      </Field>
      <Field label="סיסמה" htmlFor="login-pass">
        <input id="login-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </Field>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "מתחבר..." : "כניסה"}
      </button>
    </form>
  );
}

export function RegisterForm({ needsCode }: { needsCode: boolean }) {
  const { setSession } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ displayName: "", username: "", password: "", signupCode: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (f.displayName.trim().length < 2) er.displayName = "יש להזין שם להצגה";
    if (f.username.trim().length < 3) er.username = "שם משתמש: לפחות 3 תווים";
    if (f.password.length < 8) er.password = "הסיסמה חייבת להכיל לפחות 8 תווים";
    if (needsCode && !f.signupCode.trim()) er.signupCode = "יש להזין את קוד ההרשמה של השבט";
    setErrors(er);
    setError("");
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const r = await api<AuthResponse>("/api/auth/register", { method: "POST", body: { ...f, displayName: f.displayName.trim(), username: f.username.trim() } });
      setSession(r.token, r.user);
      toast(`ברוכים הבאים, ${r.user.displayName}`, { kind: "success" });
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
        <input id="reg-user" value={f.username} onChange={(e) => set("username", e.target.value)} autoComplete="username" aria-invalid={!!errors.username} aria-describedby={errors.username ? "reg-user-err" : undefined} />
      </Field>
      <Field label="סיסמה" htmlFor="reg-pass" error={errors.password} hint="לפחות 8 תווים">
        <input id="reg-pass" type="password" value={f.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby={errors.password ? "reg-pass-err" : undefined} />
      </Field>
      {needsCode && (
        <Field label="קוד הרשמה של השבט" htmlFor="reg-code" error={errors.signupCode} hint="את הקוד מקבלים ממנהל השבט">
          <input id="reg-code" value={f.signupCode} onChange={(e) => set("signupCode", e.target.value)} autoComplete="off" aria-invalid={!!errors.signupCode} aria-describedby={errors.signupCode ? "reg-code-err" : undefined} />
        </Field>
      )}
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
