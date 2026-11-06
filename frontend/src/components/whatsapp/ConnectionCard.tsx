"use client";

// חיבור חי: מצב הגשר (מחובר, מנותק, מתחבר מחדש), QR לסריקה, ומצב התור והמגבלות. מתרענן בעצמו.
import { Smartphone } from "lucide-react";
import type { WaStatus } from "@/lib/wa-api";
import { Alert } from "./wa-ui";

export const STATE_LABEL: Record<string, string> = {
  offline: "הגשר לא פעיל",
  starting: "מתחיל",
  qr: "ממתין לסריקת QR",
  connected: "מחובר",
  disconnected: "מנותק",
  reconnecting: "מתחבר מחדש",
  conflict: "התנגשות: וואטסאפ ווב פתוח במקום אחר",
};
const REASON: Record<string, string> = {
  ok: "מוכן לשליחה",
  gap: "ממתין להשהיה בין הודעות",
  cooldown: "ממתין להשהיה לאותו איש קשר",
  minute: "הגעתם למכסת הדקה",
  hour: "הגעתם למכסת השעה",
  day: "הגעתם למכסת היום",
  quiet: "שעות שקט",
  shabbat: "הפסקת שבת",
  paused: "השליחה מושהית בהגדרות",
  breaker: "עצירה אוטומטית",
  not_connected: "וואטסאפ לא מחובר",
};

export function StatePill({ state }: { state: string }) {
  return (
    <span className="wa-pill" data-state={state}>
      <i aria-hidden="true" />
      {STATE_LABEL[state] ?? state}
    </span>
  );
}

const secs = (ms: number) => (ms >= 60_000 ? `${Math.round(ms / 60_000)} דקות` : `${Math.max(1, Math.round(ms / 1000))} שניות`);

export function ConnectionCard({ status, onClearBreaker, busy }: { status: WaStatus; onClearBreaker: () => void; busy: boolean }) {
  const { bridge, queue } = status;
  const qr = bridge.qrSvg ? `data:image/svg+xml;utf8,${encodeURIComponent(bridge.qrSvg)}` : bridge.qrImage?.startsWith("data:image/png;base64,") ? bridge.qrImage : null;

  return (
    <section className="wa-card" aria-label="חיבור וואטסאפ">
      <div className="wa-row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>חיבור וואטסאפ</h2>
        <StatePill state={bridge.state} />
      </div>

      {bridge.state === "qr" && qr && (
        <div style={{ marginTop: 14 }}>
          <div className="wa-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="קוד QR לקישור וואטסאפ" />
          </div>
          <ol className="wa-steps" style={{ marginTop: 12 }}>
            <li>בטלפון של השבט: וואטסאפ ← הגדרות ← מכשירים מקושרים.</li>
            <li>לחצו "קישור מכשיר" וסרקו את הקוד.</li>
            <li>הקוד מתחלף כל כמה שניות. אל תצלמו אותו ואל תשלחו אותו: מי שסורק אותו שולט בחשבון.</li>
          </ol>
        </div>
      )}
      {bridge.state === "qr" && !qr && <p className="wa-muted">הגשר ממתין לסריקה, והקוד בדרך…</p>}

      {bridge.state === "connected" && (
        <p style={{ margin: "12px 0 0" }}>
          <Smartphone size={18} aria-hidden="true" style={{ verticalAlign: "-3px" }} /> מחובר
          {bridge.account?.name ? ` כ"${bridge.account.name}"` : ""}
          {bridge.account?.hint ? ` (מספר שמסתיים ב-${bridge.account.hint})` : ""}
          {bridge.version ? ` · גשר ${bridge.version}` : ""}
        </p>
      )}
      {bridge.state === "offline" && (
        <Alert info>
          הגשר לא מדווח. הוא רץ על המחשב שלכם (לא על Render): הפעילו את <b>start-bridge.bat</b> בתיקיית wa-bridge. אם זו הפעם הראשונה, צרו אסימון בחלק "גשר למחשב" למטה.
        </Alert>
      )}
      {bridge.state === "conflict" && <Alert>וואטסאפ ווב פתוח בדפדפן אחר באותו חשבון. סגרו אותו, והגשר יתחבר מחדש.</Alert>}
      {bridge.lastSeenMs !== null && bridge.state !== "offline" && <p className="wa-muted">פעימה אחרונה לפני {secs(bridge.lastSeenMs)}</p>}

      <hr style={{ border: 0, borderTop: "1px solid var(--wa-line)", margin: "14px 0" }} />
      <dl className="wa-row" style={{ margin: 0, gap: 22 }}>
        <div><dt className="wa-muted">בתור</dt><dd style={{ margin: 0, fontWeight: 800, fontSize: "1.4rem" }}>{queue.queued}</dd></div>
        <div><dt className="wa-muted">נשלחו בדקה / שעה / יום</dt><dd style={{ margin: 0, fontWeight: 800, fontSize: "1.4rem" }}>{queue.sent.minute} / {queue.sent.hour} / {queue.sent.day}</dd></div>
        <div><dt className="wa-muted">מצב השליחה</dt><dd style={{ margin: 0, fontWeight: 700 }}>{REASON[queue.reason] ?? queue.reason}{queue.nextAllowedInMs > 1500 ? ` (עוד ${secs(queue.nextAllowedInMs)})` : ""}</dd></div>
      </dl>

      {queue.breakerUntil && (
        <div style={{ marginTop: 12 }}>
          <Alert>השליחה נעצרה אוטומטית אחרי כשלונות רצופים (עד {new Date(queue.breakerUntil).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}). בדקו את החיבור לפני שחרור.</Alert>
          <button type="button" className="wa-btn soft small" style={{ marginTop: 8 }} disabled={busy} onClick={onClearBreaker}>שחרור העצירה</button>
        </div>
      )}
    </section>
  );
}
