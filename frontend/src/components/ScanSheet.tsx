"use client";

// שלב 69: סריקת מערך מצולם (Vision OCR). מצלמים או בוחרים תמונה של דף פעולה כתוב, והשרת מתמלל אותה (Gemini דרך GEMINI_API_KEY),
// ואותו מנתח של ייבוא קבצים מסדר אותה בחמשת השלבים. בלי מפתח, מעל המכסה או בלי חיבור: הקלדה ידנית של הטקסט, ואותו מנתח מסדר אותה.
// הפרטיות: התמונה מכווצת בדפדפן (וכך גם נמחק ממנה מידע מצולם כמו מיקום), נשלחת רק אחרי אישור מפורש, ואינה נשמרת בשרת.
import { useEffect, useRef, useState } from "react";
import { API_URL, api, errorMessage, parseImportFile, type ParsedDoc } from "@/lib/api";
import { useAuth } from "./Providers";
import { Field } from "./ui";

type ScanResult = ParsedDoc & { transcript?: string };

async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const g = c.getContext("2d");
  if (!g) throw new Error("canvas");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("blob"))), "image/jpeg", 0.82));
}

export function ScanSheet({ onDraft }: { onDraft: (file: string, d: ParsedDoc, transcript?: string) => void }) {
  const { token } = useAuth();
  const [ai, setAi] = useState<boolean | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [manual, setManual] = useState(false);
  const [text, setText] = useState("");
  const url = useRef("");

  useEffect(() => {
    api<{ ai: boolean }>("/api/lux/eagle/info")
      .then((i) => setAi(!!i.ai))
      .catch(() => setAi(null));
    return () => {
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr("");
    if (!f.type.startsWith("image/")) {
      setErr("יש לבחור קובץ תמונה (JPG, PNG או WebP).");
      return;
    }
    try {
      const b = await shrink(f);
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(b);
      setBlob(b);
      setName(f.name || "תמונה");
      setPreview(url.current);
    } catch {
      setErr("לא הצלחתי לקרוא את התמונה. אפשר לנסות JPG או PNG, או להקליד את הטקסט ידנית.");
      setManual(true);
    }
  };

  const scan = async () => {
    if (!blob || !token) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`${API_URL}/api/lux/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "x-scan-consent": "yes", Authorization: `Bearer ${token}` },
        body: blob,
      });
      const data = (await res.json().catch(() => null)) as (ScanResult & { error?: { code?: string; message?: string } }) | null;
      if (!res.ok || !data || data.error) {
        setErr(data?.error?.message ?? "הסריקה נכשלה. אפשר להקליד את הטקסט ידנית.");
        setManual(true);
        return;
      }
      onDraft(`סריקה: ${name}`, data, data.transcript);
    } catch {
      setErr("אין חיבור לשרת. אפשר להקליד את הטקסט ידנית.");
      setManual(true);
    } finally {
      setBusy(false);
    }
  };

  const parseManual = async () => {
    setBusy(true);
    setErr("");
    try {
      const d = await parseImportFile(new File([text], "scan.txt", { type: "text/plain" }));
      onDraft(`הקלדה: ${name || "דף פעולה"}`, d, text);
      setText("");
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card glass f69-scan" aria-labelledby="scan-title">
      <h2 id="scan-title" className="section-title">
        סריקת מערך מצולם
      </h2>
      <p className="hint">מצלמים דף פעולה כתוב (או בוחרים תמונה) והוא הופך לפעולה דיגיטלית בחמשת השלבים. אחרי הסריקה חובה לקרוא ולתקן: כתב יד ומספרים עלולים להיקרא לא נכון.</p>
      {ai === false && <p className="warn-box">הסריקה האוטומטית דורשת מפתח GEMINI_API_KEY בשרת (Render, Environment). בינתיים אפשר להקליד את הטקסט ידנית.</p>}
      {!token && <p className="hint">הסריקה האוטומטית זמינה למדריכים מחוברים. הקלדה ידנית פתוחה לכולם.</p>}
      <Field label="צילום או בחירת תמונה של דף פעולה" htmlFor="scan-file" hint="JPG, PNG או WebP. בטלפון אפשר לצלם ישר מהמצלמה.">
        <input id="scan-file" type="file" accept="image/*" onChange={(e) => void pick(e.target.files?.[0])} disabled={busy} />
      </Field>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="f69-prev" src={preview} alt="תצוגה מקדימה של הדף שנבחר" />
      )}
      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>אני מאשר/ת לשלוח את התמונה לתמלול אצל Google Gemini. אין בתמונה שמות ילדים או פרטים אישיים (בשירות החינמי של Google ייתכן שימוש בתוכן לשיפור השירות).</span>
      </label>
      {err && (
        <p className="error-box" role="alert">
          {err}
        </p>
      )}
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={scan} disabled={!blob || !consent || !token || busy || ai === false}>
          {busy ? "קורא את הדף..." : "סריקה אוטומטית"}
        </button>
        <button type="button" className="btn" aria-expanded={manual} aria-controls="scan-manual" onClick={() => setManual(!manual)}>
          הקלדה ידנית במקום סריקה
        </button>
      </div>
      {manual && (
        <div id="scan-manual" className="f69-body">
          <p className="hint">מקלידים או מכתיבים (במקלדת הטלפון) את הטקסט מהדף. שורה ראשונה: שם הפעולה. כותרות כמו ״פתיחה (5 דקות)״ ו״דיון״ מסדרות אותו בשלבים. התמונה לא נשלחת לשום מקום.</p>
          <Field label="הטקסט מהדף" htmlFor="scan-text">
            <textarea id="scan-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} maxLength={12000} />
          </Field>
          <button type="button" className="btn btn-primary" onClick={parseManual} disabled={busy || text.trim().length < 20}>
            סידור הטקסט בשלבים
          </button>
        </div>
      )}
    </section>
  );
}
