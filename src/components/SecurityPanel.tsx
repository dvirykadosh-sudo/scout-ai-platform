"use client";

// אבטחת החשבון: מייל וטלפון, אימות דו-שלבי ומכשירים מחוברים.
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, fmtDate } from "@/lib/api";
import Link from "next/link";
import { useAuth, useToast } from "./Providers";
import { Field } from "./ui";

interface Sec {
  email: string;
  phone: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  totpEnabled: boolean;
  backupCodesLeft: number;
  providers: { email: boolean; phone: boolean };
  lastLoginAt: string | null;
}
interface Dev {
  id: string;
  device: string;
  ip: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

function Contact({ sec, reload }: { sec: Sec; reload: () => void }) {
  const { token } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState(sec.email);
  const [phone, setPhone] = useState(sec.phone);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [code, setCode] = useState<{ channel: "email" | "phone"; value: string; hint: string } | null>(null);
  const [dev, setDev] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await api("/api/me/contact", { method: "PUT", token, body: { password, email, phone } });
      setPassword("");
      toast("הפרטים נשמרו", { kind: "success" });
      reload();
    } catch (x) {
      setErr(errorMessage(x));
    }
  };
  const request = async (channel: "email" | "phone") => {
    setErr("");
    setDev("");
    try {
      const r = await api<{ sentTo: string; devCode?: string }>("/api/me/verify/request", { method: "POST", token, body: { channel } });
      setCode({ channel, value: "", hint: `נשלח קוד אל ${r.sentTo}` });
      if (r.devCode) setDev(`מצב פיתוח: הקוד הוא ${r.devCode}`);
    } catch (x) {
      setErr(errorMessage(x));
    }
  };
  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    try {
      await api("/api/me/verify/confirm", { method: "POST", token, body: { channel: code.channel, code: code.value } });
      toast("אומת", { kind: "success" });
      setCode(null);
      setDev("");
      reload();
    } catch (x) {
      setErr(errorMessage(x));
    }
  };
  const badge = (has: boolean, ok: boolean) => (!has ? null : <span className={ok ? "pill pill-ok" : "pill pill-warn"}>{ok ? "מאומת" : "לא מאומת"}</span>);
  return (
    <section aria-labelledby="sec-contact" className="card glass">
      <h2 id="sec-contact" className="section-title">
        מייל וטלפון
      </h2>
      <p className="hint">מייל או טלפון מאומתים מאפשרים להיכנס איתם במקום שם המשתמש, ולאפס סיסמה בעצמכם.</p>
      {err && (
        <p className="error-box" role="alert">
          {err}
        </p>
      )}
      <form onSubmit={save} noValidate>
        <Field label="מייל" htmlFor="sec-email">
          <input id="sec-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <p>
          {badge(!!sec.email, sec.emailVerified)}{" "}
          {sec.email && !sec.emailVerified && (
            <button type="button" className="btn btn-small" onClick={() => request("email")}>
              אימות המייל
            </button>
          )}
        </p>
        <Field label="טלפון" htmlFor="sec-phone">
          <input id="sec-phone" type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </Field>
        <p>
          {badge(!!sec.phone, sec.phoneVerified)}{" "}
          {sec.phone && !sec.phoneVerified && (
            <button type="button" className="btn btn-small" onClick={() => request("phone")}>
              אימות הטלפון
            </button>
          )}
        </p>
        <Field label="הסיסמה שלכם (לאישור שינוי)" htmlFor="sec-contact-pw">
          <input id="sec-contact-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <button className="btn btn-primary" disabled={!password}>
          שמירת פרטים
        </button>
      </form>
      {(!sec.providers.email || !sec.providers.phone) && (
        <p className="hint">
          {!sec.providers.email && "שליחת מיילים עוד לא הוגדרה באתר. "}
          {!sec.providers.phone && "שליחת SMS עוד לא הוגדרה באתר. "}
          עד שתוגדר, האדמין יכול לאמת בשבילכם.
        </p>
      )}
      {code && (
        <form onSubmit={confirm} noValidate aria-label="אימות קוד">
          <p role="status">{code.hint}</p>
          {dev && <p className="hint">{dev}</p>}
          <Field label="קוד בן 6 ספרות" htmlFor="sec-code">
            <input id="sec-code" inputMode="numeric" dir="ltr" value={code.value} onChange={(e) => setCode({ ...code, value: e.target.value })} autoComplete="one-time-code" />
          </Field>
          <button className="btn btn-primary" disabled={code.value.length < 4}>
            אישור הקוד
          </button>
        </form>
      )}
    </section>
  );
}

function TwoFactor({ sec, reload }: { sec: Sec; reload: () => void }) {
  const { token } = useAuth();
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [backups, setBackups] = useState<string[] | null>(null);
  const [err, setErr] = useState("");
  const [off, setOff] = useState(false);
  const [pw, setPw] = useState("");

  const start = async () => {
    setErr("");
    try {
      const r = await api<{ secret: string; otpauth: string }>("/api/me/2fa/setup", { method: "POST", token, body: {} });
      setSetup({ secret: r.secret, qr: await QRCode.toDataURL(r.otpauth, { margin: 1, width: 200 }) });
    } catch (x) {
      setErr(errorMessage(x));
    }
  };
  const enable = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ backupCodes: string[] }>("/api/me/2fa/enable", { method: "POST", token, body: { code } });
      setBackups(r.backupCodes);
      setSetup(null);
      setCode("");
      setErr("");
      reload();
    } catch (x) {
      setErr(errorMessage(x));
    }
  };
  const disable = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/me/2fa/disable", { method: "POST", token, body: { password: pw, code } });
      toast("האימות הדו-שלבי כובה", { kind: "info" });
      setOff(false);
      setPw("");
      setCode("");
      setErr("");
      reload();
    } catch (x) {
      setErr(errorMessage(x));
    }
  };
  return (
    <section aria-labelledby="sec-2fa" className="card glass">
      <h2 id="sec-2fa" className="section-title">
        אימות דו-שלבי
      </h2>
      <p className="hint">בנוסף לסיסמה, כניסה דורשת קוד מאפליקציה בטלפון (Google Authenticator, Microsoft Authenticator או דומות). מומלץ במיוחד לאדמינים.</p>
      {err && (
        <p className="error-box" role="alert">
          {err}
        </p>
      )}
      {backups && (
        <div className="ok-box" role="status">
          <p>
            <strong>קודי גיבוי.</strong> שמרו אותם במקום בטוח. כל קוד עובד פעם אחת, למקרה שהטלפון אבד. הם לא יוצגו שוב.
          </p>
          <ul className="tag-list" dir="ltr">
            {backups.map((b) => (
              <li key={b}>
                <code>{b}</code>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-small" onClick={() => setBackups(null)}>
            שמרתי, אפשר להסתיר
          </button>
        </div>
      )}
      {!sec.totpEnabled && !setup && (
        <button type="button" className="btn btn-primary" onClick={start}>
          הפעלת אימות דו-שלבי
        </button>
      )}
      {setup && (
        <form onSubmit={enable} noValidate aria-label="הגדרת אימות דו-שלבי">
          <ol>
            <li>פתחו אפליקציית אימות בטלפון, והוסיפו חשבון חדש.</li>
            <li>
              סרקו את הקוד, או הקלידו את המפתח ידנית: <code dir="ltr">{setup.secret}</code>
            </li>
            <li>הזינו את הקוד בן 6 הספרות שהאפליקציה מציגה.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="קוד QR להגדרת האפליקציה" width={200} height={200} />
          <Field label="קוד מהאפליקציה" htmlFor="sec-2fa-code">
            <input id="sec-2fa-code" inputMode="numeric" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />
          </Field>
          <button className="btn btn-primary" disabled={code.trim().length < 6}>
            אישור והפעלה
          </button>
        </form>
      )}
      {sec.totpEnabled && (
        <>
          <p>
            <span className="pill pill-ok">פעיל</span> · נשארו {sec.backupCodesLeft} קודי גיבוי
          </p>
          {!off ? (
            <button type="button" className="btn" onClick={() => setOff(true)}>
              כיבוי האימות הדו-שלבי
            </button>
          ) : (
            <form onSubmit={disable} noValidate aria-label="כיבוי אימות דו-שלבי">
              <Field label="הסיסמה" htmlFor="sec-off-pw">
                <input id="sec-off-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
              </Field>
              <Field label="קוד מהאפליקציה או קוד גיבוי" htmlFor="sec-off-code">
                <input id="sec-off-code" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />
              </Field>
              <div className="actions">
                <button className="btn btn-primary" disabled={!pw || code.trim().length < 4}>
                  כיבוי
                </button>
                <button type="button" className="btn" onClick={() => setOff(false)}>
                  ביטול
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}

function Devices() {
  const { token } = useAuth();
  const toast = useToast();
  const [list, setList] = useState<Dev[] | null>(null);
  const load = useCallback(() => {
    api<Dev[]>("/api/me/sessions", { token })
      .then(setList)
      .catch(() => setList([]));
  }, [token]);
  useEffect(load, [load]);
  const revoke = async (d: Dev) => {
    try {
      await api(`/api/me/sessions/${d.id}`, { method: "DELETE", token });
      toast("המכשיר נותק", { kind: "success" });
      load();
    } catch (x) {
      toast(errorMessage(x), { kind: "error" });
    }
  };
  const others = async () => {
    try {
      const r = await api<{ revoked: number }>("/api/me/sessions/revoke-others", { method: "POST", token, body: {} });
      toast(r.revoked ? `נותקו ${r.revoked} מכשירים` : "אין מכשירים אחרים מחוברים", { kind: "info" });
      load();
    } catch (x) {
      toast(errorMessage(x), { kind: "error" });
    }
  };
  return (
    <section aria-labelledby="sec-dev" className="card glass">
      <h2 id="sec-dev" className="section-title">
        מכשירים מחוברים
      </h2>
      <p className="hint">אם אתם לא מזהים מכשיר, נתקו אותו והחליפו סיסמה.</p>
      {list && list.length > 0 && (
        <ul className="plain-list">
          {list.map((d) => (
            <li key={d.id}>
              <span>
                <strong>{d.device}</strong> {d.current && <span className="pill pill-ok">המכשיר הזה</span>}
                <br />
                <span className="hint">
                  כניסה: {fmtDate(d.createdAt)} · פעיל לאחרונה: {fmtDate(d.lastSeenAt)} · IP {d.ip}
                </span>
              </span>
              {!d.current && (
                <button type="button" className="btn btn-small" onClick={() => revoke(d)}>
                  ניתוק<span className="sr-only">: {d.device}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {list && list.length > 1 && (
        <button type="button" className="btn" onClick={others}>
          ניתוק כל המכשירים האחרים
        </button>
      )}
    </section>
  );
}

function Privacy() {
  const { token, user, setSession } = useAuth();
  const toast = useToast();
  const accept = async () => {
    try {
      await api("/api/me/terms", { method: "POST", token, body: { accept: true } });
      if (user && token) setSession(token, { ...user, termsAccepted: true });
      toast("תודה, האישור נשמר", { kind: "success" });
    } catch (x) {
      toast(errorMessage(x), { kind: "error" });
    }
  };
  const purge = async () => {
    if (!window.confirm("למחוק את כתובות ה-IP ששמורות על החשבון שלכם ביומן הכניסות ובמכשירים המחוברים?")) return;
    try {
      const r = await api<{ cleared: number }>("/api/me/purge-ip", { method: "POST", token });
      toast(`נמחקו ${r.cleared} כתובות`, { kind: "success" });
    } catch (x) {
      toast(errorMessage(x), { kind: "error" });
    }
  };
  return (
    <section aria-labelledby="sec-priv" className="card glass">
      <h2 id="sec-priv" className="section-title">
        פרטיות
      </h2>
      {user && user.termsAccepted === false && (
        <div className="warn-box">
          <p>
            עדכנו את <Link href="/privacy">תנאי השימוש ומדיניות הפרטיות</Link>. יש לאשר את הנוסח הנוכחי.
          </p>
          <button type="button" className="btn btn-small" onClick={accept}>
            קראתי ומאשר/ת
          </button>
        </div>
      )}
      <p className="hint">
        האתר שומר כתובת IP בכניסות לצורכי אבטחה, ומוחק אותן אוטומטית אחרי תקופה קצובה. פרטים מלאים ב<Link href="/privacy">דף הפרטיות</Link>.
      </p>
      <button type="button" className="btn" onClick={purge}>
        מחיקת כתובות ה-IP שלי
      </button>
    </section>
  );
}

export function SecurityPanel() {
  const { token } = useAuth();
  const [sec, setSec] = useState<Sec | null>(null);
  const load = useCallback(() => {
    api<Sec>("/api/me/security", { token })
      .then(setSec)
      .catch(() => {});
  }, [token]);
  useEffect(load, [load]);
  if (!sec) return null;
  return (
    <>
      <Contact key={`${sec.email}|${sec.phone}`} sec={sec} reload={load} />
      <TwoFactor sec={sec} reload={load} />
      <Devices />
      <Privacy />
    </>
  );
}
