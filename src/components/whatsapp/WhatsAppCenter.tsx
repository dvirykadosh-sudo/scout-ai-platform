"use client";

// מרכז הוואטסאפ: מעטפת עם באנר סגול-ורוד, מצב חיבור חי, ולשוניות נגישות (חיצי מקלדת, Home, End).
// זמין רק למנהל ראשי. אחרים רואים הסבר, ולא נשלחת בקשה לשרת בשבילם.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { ApiError, errorMessage } from "@/lib/api";
import { waApi, type WaStatus } from "@/lib/wa-api";
import { isAdminUser, useAuth } from "../Providers";
import { Alert, useAct } from "./wa-ui";
import { BridgeSetup } from "./BridgeSetup";
import { Composer } from "./Composer";
import { ConnectionCard, StatePill } from "./ConnectionCard";
import { Contacts } from "./Contacts";
import { Inbox } from "./Inbox";
import { Kanban } from "./Kanban";
import { Rsvp } from "./Rsvp";
import { Rules } from "./Rules";
import { SendLog } from "./SendLog";
import { Templates } from "./Templates";
import { WaSettings } from "./WaSettings";

const TABS = [
  { id: "overview", label: "סקירה" },
  { id: "inbox", label: "הודעות נכנסות" },
  { id: "send", label: "שליחה" },
  { id: "contacts", label: "אנשי קשר" },
  { id: "templates", label: "תבניות" },
  { id: "rules", label: "כללים" },
  { id: "rsvp", label: "אישורי הגעה" },
  { id: "log", label: "יומן" },
  { id: "settings", label: "הגדרות" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** רענון מצב החיבור: מהר כשממתינים ל-QR או לחיבור, לאט כשהכול יציב */
function useWaStatus(token: string | null) {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const live = useRef<string>("offline");
  const stopped = useRef(false);

  const reload = useCallback(async () => {
    if (!token || stopped.current) return;
    try {
      const s = await waApi(token).status();
      live.current = s.bridge.state;
      setStatus(s);
      setError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        stopped.current = true;
        setForbidden(true);
      } else {
        setError(errorMessage(e));
      }
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    stopped.current = false;
    let timer = 0;
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState === "visible") await reload();
      if (cancelled || stopped.current) return;
      const s = live.current;
      const wait = s === "qr" || s === "starting" || s === "reconnecting" ? 2000 : s === "connected" ? 6000 : 4000;
      timer = window.setTimeout(tick, wait);
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [token, reload]);

  return { status, error, forbidden, reload };
}

export function WhatsAppCenter() {
  const { token, user, ready } = useAuth();
  const admin = Boolean(token && user && isAdminUser(user));
  const { status, error, forbidden, reload } = useWaStatus(admin ? token : null);
  const { act, busy } = useAct();
  const [tab, setTab] = useState<TabId>("overview");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    // האתר מימין לשמאל: חץ שמאלה = הלשונית הבאה
    let n = i;
    if (e.key === "ArrowLeft") n = (i + 1) % TABS.length;
    else if (e.key === "ArrowRight") n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(TABS[n].id);
    tabRefs.current[TABS[n].id]?.focus();
  };

  let body;
  if (!ready) {
    body = <p className="wa-muted" role="status">טוען…</p>;
  } else if (!token || !user) {
    body = (
      <div className="wa-card">
        <h2>צריך להתחבר</h2>
        <p>מרכז הוואטסאפ זמין רק למנהל הראשי של השבט.</p>
        <Link className="wa-btn" href="/login?next=/whatsapp">כניסה</Link>
      </div>
    );
  } else if (!admin || forbidden) {
    body = (
      <div className="wa-card">
        <h2>אין הרשאה</h2>
        <p>מרכז הוואטסאפ זמין רק למנהל הראשי. זה מגן על אנשי הקשר ועל החניכים: אין כאן גישה לחשבון וואטסאפ בלי אישור מפורש.</p>
      </div>
    );
  } else {
    body = (
      <>
        {error && <Alert>{error}</Alert>}
        <div className="wa-tabs" role="tablist" aria-label="מרכז הוואטסאפ" onKeyDown={onKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => { tabRefs.current[t.id] = el; }}
              type="button"
              role="tab"
              id={`wa-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`wa-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className="wa-tab"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`wa-panel-${tab}`} aria-labelledby={`wa-tab-${tab}`} tabIndex={0} style={{ display: "grid", gap: 16 }}>
          {tab === "overview" && (
            <>
              {status ? (
                <ConnectionCard status={status} busy={busy} onClearBreaker={async () => { if (await act(() => waApi(token).clearBreaker(), "העצירה שוחררה.")) void reload(); }} />
              ) : (
                <p className="wa-muted" role="status">טוען מצב חיבור…</p>
              )}
              {status && status.bridges.filter((b) => !b.revokedAt).length === 0 && <BridgeSetup token={token} bridges={status.bridges} publicUrl={status.publicUrl} onChanged={reload} />}
              <Kanban token={token} />
            </>
          )}
          {tab === "inbox" && <Inbox token={token} />}
          {tab === "send" && <Composer token={token} />}
          {tab === "contacts" && <Contacts token={token} />}
          {tab === "templates" && <Templates token={token} />}
          {tab === "rules" && <Rules token={token} />}
          {tab === "rsvp" && <Rsvp token={token} />}
          {tab === "log" && <SendLog token={token} />}
          {tab === "settings" && status && (
            <>
              <WaSettings token={token} settings={status.settings} onSaved={reload} />
              <BridgeSetup token={token} bridges={status.bridges} publicUrl={status.publicUrl} onChanged={reload} />
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="wa-shell">
      <div className="wa-work">
        <header className="wa-banner">
          <MessageCircle size={34} aria-hidden="true" />
          <div className="grow">
            <h1>מרכז הוואטסאפ</h1>
            <p>תזכורות, הודעות ואישורי הגעה, בקצב אנושי ובשליטה מלאה שלכם.</p>
          </div>
          {admin && status && <StatePill state={status.bridge.state} />}
        </header>
        {body}
      </div>
    </div>
  );
}
