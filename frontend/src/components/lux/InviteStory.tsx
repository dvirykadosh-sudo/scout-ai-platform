"use client";

// שלב 71: כרטיס הזמנה בפורמט סטורי (9:16) לחניכים ולהורים. נבנה בדפדפן, בלי שליחה של פרטי המפגש לשרת.
// אישור הגעה: קישור wa.me למספר שלכם עם מפתח אירוע (#abc123). הבוט מזהה את המפתח ורושם את התשובה בלשונית "אישורי הגעה".
// הכול נשמר רק אצלכם: מספר הוואטסאפ ב-localStorage, והאירוע (מפתח + כותרת בלבד) בשרת.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage, storageGet, storageSet } from "@/lib/api";
import { inviteMessage, rsvpLink, waNumber, type InviteFields } from "@/lib/invite";
import { drawStory } from "@/lib/story";
import { waApi } from "@/lib/wa-api";
import type { Activity } from "@/lib/types";
import { isAdminUser, useAuth, useToast } from "../Providers";
import { Field } from "../ui";

type Mode = "rsvp" | "page" | "none";
const PHONE_KEY = "maoz.rsvp.phone";

const loadImg = (src: string, cors: boolean) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const i = new Image();
    if (cors) i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = src;
  });

export function InviteStory({ a, color, logoSrc }: { a: Activity; color: string; logoSrc: string }) {
  const { token, user } = useAuth();
  const toast = useToast();
  const admin = !!token && isAdminUser(user);
  const canvas = useRef<HTMLCanvasElement>(null);
  const noGear = /^(אין|ללא|בלי)/.test(a.equipment.trim());
  const [f, setF] = useState<InviteFields>({ title: a.title, line: `מזמינים אתכם לפעולה של ${a.tribe || "שבט מעוז"}`, date: "", time: "", place: "", bring: noGear ? "" : a.equipment.slice(0, 90) });
  const [mode, setMode] = useState<Mode>(admin ? "rsvp" : "page");
  const [phone, setPhone] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    setPhone(storageGet(PHONE_KEY) ?? "");
    try {
      const k = JSON.parse(storageGet(`maoz.story.${a.id}`) ?? "null");
      if (k && typeof k.key === "string") setKey(k.key);
    } catch {
      /* ignore */
    }
  }, [a.id]);
  useEffect(() => {
    const saved = storageGet(`maoz.story.mode.${a.id}`);
    if ((saved === "rsvp" && admin) || saved === "page" || saved === "none") setMode(saved);
    else if (admin) setMode("rsvp");
  }, [admin, a.id]);

  const pageUrl = origin ? `${origin}/library/${a.id}` : null;
  const phoneOk = !phone.trim() || !!waNumber(phone);
  const link = useMemo(() => (mode === "rsvp" && key ? rsvpLink(phone, key) : mode === "page" ? pageUrl : null), [mode, key, phone, pageUrl]);

  const set = (k: keyof InviteFields) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const savePhone = (v: string) => {
    setPhone(v);
    storageSet(PHONE_KEY, v);
  };

  const makeEvent = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const r = await waApi(token).createRsvpEvent(f.title.trim() || a.title);
      setKey(r.key);
      storageSet(`maoz.story.${a.id}`, JSON.stringify({ key: r.key }));
      toast("נוצר אירוע אישורי הגעה. התשובות יופיעו במרכז הוואטסאפ", { kind: "success" });
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };

  // ציור מחדש בכל שינוי (עם השהיה קצרה בזמן הקלדה)
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(async () => {
      const el = canvas.current;
      if (!el) return;
      const [logo, qrImg] = await Promise.all([
        loadImg(logoSrc, true),
        link
          ? import("qrcode").then((Q) => Q.toDataURL(link, { margin: 1, width: 400, errorCorrectionLevel: "M", color: { dark: "#12081f", light: "#ffffff" } })).then((u) => loadImg(u, false))
          : Promise.resolve(null),
      ]);
      if (!live) return;
      try {
        await document.fonts?.ready;
      } catch {
        /* ignore */
      }
      drawStory(el, {
        fields: f,
        color,
        tribe: a.tribe || "שבט מעוז",
        logo,
        qr: qrImg,
        qrCaption: mode === "rsvp" ? "סרקו כדי לאשר הגעה בוואטסאפ" : "סרקו כדי לראות את הפרטים",
        fontFamily: getComputedStyle(document.body).fontFamily || "Arial, sans-serif",
      });
      setDrawn(true);
    }, 180);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [f, color, link, mode, logoSrc, a.tribe]);

  const blob = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const el = canvas.current;
        if (!el) return resolve(null);
        try {
          el.toBlob((b) => resolve(b), "image/png");
        } catch {
          resolve(null);
        }
      }),
    [],
  );
  const download = async () => {
    const b = await blob();
    if (!b) return toast("לא הצלחנו לייצר את התמונה. נסו בלי הלוגו או בדפדפן אחר", { kind: "error" });
    const u = URL.createObjectURL(b);
    const el = document.createElement("a");
    el.href = u;
    el.download = "invite-story.png";
    document.body.appendChild(el);
    el.click();
    el.remove();
    window.setTimeout(() => URL.revokeObjectURL(u), 20_000);
  };
  const message = inviteMessage(f, mode === "rsvp" ? link : null, mode === "page" ? pageUrl : null);
  const share = async () => {
    const b = await blob();
    const file = b ? new File([b], "invite-story.png", { type: "image/png" }) : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: message });
      else if (navigator.share) await navigator.share({ text: message });
      else {
        await navigator.clipboard.writeText(message);
        toast("השיתוף הישיר לא נתמך כאן. ההודעה הועתקה, והתמונה אפשר להוריד", { kind: "info" });
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast("השיתוף נכשל. אפשר להוריד את התמונה ולהעתיק את ההודעה", { kind: "error" });
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast("ההודעה הועתקה. הדביקו אותה ליד הסטורי", { kind: "success" });
    } catch {
      toast("ההעתקה נכשלה", { kind: "error" });
    }
  };

  const needPhone = mode === "rsvp" && !!key && !waNumber(phone);

  return (
    <div className="story71" role="group" aria-label="כרטיס הזמנה לסטורי">
      <div className="story71-form card glass no-print">
        <p className="hint">כרטיס אנכי (9:16) להזמנת חניכים והורים: מורידים כתמונה ומעלים לסטטוס או שולחים בקבוצה. בתמונה אין שמות חניכים, רק פרטי הפעולה.</p>
        <div className="form-grid">
          <Field label="כותרת" htmlFor="st-title" className="span-2">
            <input id="st-title" value={f.title} maxLength={80} onChange={set("title")} />
          </Field>
          <Field label="משפט הזמנה" htmlFor="st-line" className="span-2">
            <input id="st-line" value={f.line} maxLength={100} onChange={set("line")} />
          </Field>
          <Field label="תאריך" htmlFor="st-date">
            <input id="st-date" type="date" value={f.date} onChange={set("date")} />
          </Field>
          <Field label="שעה" htmlFor="st-time">
            <input id="st-time" type="time" value={f.time} onChange={set("time")} />
          </Field>
          <Field label="מקום" htmlFor="st-place">
            <input id="st-place" value={f.place} maxLength={60} onChange={set("place")} />
          </Field>
          <Field label="מה להביא" htmlFor="st-bring">
            <input id="st-bring" value={f.bring} maxLength={90} onChange={set("bring")} />
          </Field>
        </div>

        <fieldset className="lux-fs story71-mode">
          <legend>קישור בכרטיס (קוד QR והודעה)</legend>
          <div role="radiogroup" aria-label="סוג הקישור" className="actions">
            {(
              [
                ["rsvp", "אישור הגעה בוואטסאפ", admin],
                ["page", "עמוד הפעולה", true],
                ["none", "בלי קישור", true],
              ] as [Mode, string, boolean][]
            )
              .filter((m) => m[2])
              .map(([k, l]) => (
                <label key={k} className="check">
                  <input
                    type="radio"
                    name="story-mode"
                    checked={mode === k}
                    onChange={() => {
                      setMode(k);
                      storageSet(`maoz.story.mode.${a.id}`, k);
                    }}
                  />
                  <span>{l}</span>
                </label>
              ))}
          </div>
          {!admin && <p className="hint">אישור הגעה בוואטסאפ זמין למנהל הראשי של השבט (מרכז הוואטסאפ).</p>}
        </fieldset>

        {mode === "rsvp" && (
          <div className="story71-rsvp">
            <Field label="מספר הוואטסאפ שאליו יגיעו התשובות" htmlFor="st-phone" hint="המספר של הטלפון המחובר למרכז הוואטסאפ, למשל 050-1234567. נשמר רק בדפדפן הזה.">
              <input id="st-phone" inputMode="tel" dir="ltr" value={phone} onChange={(e) => savePhone(e.target.value)} aria-invalid={!phoneOk} autoComplete="off" />
            </Field>
            {!phoneOk && <p className="error-box" role="alert">המספר לא נראה תקין. כתבו מספר ישראלי (05X...) או בינלאומי.</p>}
            {!key ? (
              <button type="button" className="btn btn-primary" onClick={makeEvent} disabled={busy}>
                {busy ? "יוצר..." : "יצירת קישור אישור הגעה"}
              </button>
            ) : (
              <p className="hint">
                האירוע פעיל. מי שלוחץ על הקישור או סורק את ה-QR שולח לכם הודעה מוכנה (״אישור הגעה: כן״), והיא נספרת ב<Link href="/whatsapp#rsvp">אישורי הגעה</Link>. נספרים רק אנשים ששמורים באנשי הקשר שלכם במרכז הוואטסאפ.
              </p>
            )}
            {needPhone && <p className="warn-box" role="status">כתבו את מספר הוואטסאפ כדי שהקישור וה-QR יופיעו בכרטיס.</p>}
          </div>
        )}

        <div className="story71-actions">
          <button type="button" className="btn btn-primary" onClick={download} disabled={!drawn}>
            הורדת תמונה (PNG)
          </button>
          <button type="button" className="btn" onClick={share} disabled={!drawn}>
            שיתוף
          </button>
          <button type="button" className="btn" onClick={copy}>
            העתקת ההודעה עם הקישור
          </button>
        </div>
        <p className="hint">בסטטוס של וואטסאפ אי אפשר ללחוץ על קישור בתוך תמונה, ולכן שלחו גם את ההודעה, או תנו להורים לסרוק את ה-QR.</p>
      </div>

      <figure className="story71-preview no-print">
        <canvas ref={canvas} className="story71-canvas" width={1080} height={1920} role="img" aria-label={`תצוגה מקדימה של כרטיס ההזמנה: ${f.title}`} />
        <figcaption className="hint">תצוגה מוקטנת. הקובץ שיורד הוא 1080×1920.</figcaption>
      </figure>
    </div>
  );
}
