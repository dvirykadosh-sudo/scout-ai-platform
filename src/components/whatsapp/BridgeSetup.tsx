"use client";

// גשר למחשב: יצירת אסימון (מוצג פעם אחת), רשימת גשרים וביטול, והוראות הפעלה.
import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import type { WaBridge } from "@/lib/wa-api";
import { waApi } from "@/lib/wa-api";
import { Alert, Field, fmtTime, useAct } from "./wa-ui";
import { useToast } from "../Providers";

export function BridgeSetup({ token, bridges, publicUrl, onChanged }: { token: string; bridges: WaBridge[]; publicUrl: string | null; onChanged: () => void }) {
  const [name, setName] = useState("המחשב שלי");
  const [fresh, setFresh] = useState<string | null>(null);
  const { act, busy } = useAct();
  const toast = useToast();
  const api = waApi(token);
  const active = bridges.filter((b) => !b.revokedAt);
  const site = publicUrl || (typeof window !== "undefined" ? window.location.origin : "");

  const create = async () => {
    const r = await act(() => api.createBridge(name.trim() || "המחשב שלי"), "האסימון נוצר. שמרו אותו עכשיו.");
    if (r) {
      setFresh(r.token);
      onChanged();
    }
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("הועתק.", { kind: "success" });
    } catch {
      toast("ההעתקה נכשלה. סמנו והעתיקו ידנית.", { kind: "error" });
    }
  };

  return (
    <section className="wa-card" aria-label="גשר למחשב">
      <h2>גשר למחשב</h2>
      <p>וואטסאפ ווב צריך דפדפן אמיתי, ולכן הגשר רץ על המחשב שלכם ומושך הודעות מהאתר. כל ההחלטות (קצב, מכסות, בוט) נשארות באתר.</p>

      <ol className="wa-steps">
        <li>צרו אסימון כאן (אפשר עד 3 גשרים פעילים).</li>
        <li>במחשב: הריצו <b>setup-bridge.bat</b> בתיקיית wa-bridge, והדביקו את הכתובת והאסימון.</li>
        <li>הריצו <b>start-bridge.bat</b>, וסרקו את ה-QR שיופיע כאן.</li>
      </ol>

      <div className="wa-row" style={{ alignItems: "flex-end", marginTop: 12 }}>
        <Field label="שם הגשר">{(id) => <input id={id} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />}</Field>
        <button type="button" className="wa-btn" onClick={create} disabled={busy || active.length >= 3}><KeyRound size={18} aria-hidden="true" />יצירת אסימון</button>
      </div>
      {active.length >= 3 && <p className="wa-muted">יש כבר 3 גשרים פעילים. בטלו אחד כדי ליצור חדש.</p>}

      {fresh && (
        <div style={{ marginTop: 14 }}>
          <Alert info>האסימון מוצג פעם אחת בלבד ולא נשמר באתר. הדביקו אותו ב-setup-bridge.bat ואל תשלחו אותו לאף אחד.</Alert>
          <p className="wa-token" dir="ltr" data-testid="bridge-token">{fresh}</p>
          <div className="wa-row">
            <button type="button" className="wa-btn soft small" onClick={() => copy(fresh)}><Copy size={16} aria-hidden="true" />העתקת האסימון</button>
            <button type="button" className="wa-btn soft small" onClick={() => copy(site)}><Copy size={16} aria-hidden="true" />העתקת כתובת האתר</button>
            <button type="button" className="wa-btn soft small" onClick={() => setFresh(null)}>הסתרה</button>
          </div>
        </div>
      )}

      {bridges.length > 0 && (
        <div className="wa-table-wrap" style={{ marginTop: 14 }}>
          <table className="wa-table">
            <caption className="sh-only-sr">הגשרים שנוצרו</caption>
            <thead><tr><th scope="col">שם</th><th scope="col">מצב אחרון</th><th scope="col">נראה לאחרונה</th><th scope="col">פעולה</th></tr></thead>
            <tbody>
              {bridges.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}{b.phoneHint ? ` (…${b.phoneHint})` : ""}</td>
                  <td>{b.revokedAt ? <span className="wa-tag failed">בוטל</span> : <span className="wa-tag">{b.lastState ?? "טרם התחבר"}</span>}</td>
                  <td>{fmtTime(b.lastSeenAt) || "—"}</td>
                  <td>{!b.revokedAt && <button type="button" className="wa-btn danger small" disabled={busy} onClick={async () => { if (await act(() => api.revokeBridge(b.id), "הגשר בוטל.")) onChanged(); }}>ביטול</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
