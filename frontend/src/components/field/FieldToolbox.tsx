"use client";

// שלב 69: ארגז כלי שטח חי במצב שטח. שלושה כלים, כולם בלי עלות:
// 1. מד רעש חי מהמיקרופון (AudioContext). המדד יחסי ולא מכויל (לא dB SPL), והשמע לא נשמר ולא נשלח לשום מקום.
// 2. מחלק קבוצות הוגן. השמות נשארים בדפדפן בלבד ולא נשמרים.
// 3. סנכרון שלב וטיימר בין מדריכים בצוות (SSE). החדר בזיכרון השרת בלבד, בלי שמות: רק שלב, מצב טיימר וכמות מחוברים.
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, api, errorMessage } from "@/lib/api";
import { groupsForSize, parseNames, parseSse, rmsToLevel, smooth, splitGroups } from "@/lib/field";
import { useAuth, useToast } from "../Providers";

export interface TeamSnap {
  idx: number;
  running: boolean;
  remaining: number;
}

type AC = typeof AudioContext;

function NoiseMeter() {
  const [on, setOn] = useState(false);
  const [level, setLevel] = useState(0);
  const [mode, setMode] = useState<"quiet" | "loud">("quiet");
  const [limit, setLimit] = useState(35);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [peak, setPeak] = useState(0);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const rt = useRef<{ stream?: MediaStream; ctx?: AudioContext; timer?: number }>({});
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const limitRef = useRef(limit);
  limitRef.current = limit;

  const stop = useCallback(() => {
    const r = rt.current;
    if (r.timer) window.clearInterval(r.timer);
    r.stream?.getTracks().forEach((t) => t.stop());
    void r.ctx?.close().catch(() => {});
    rt.current = {};
    setOn(false);
    setLevel(0);
  }, []);
  useEffect(() => stop, [stop]);

  const start = async () => {
    setErr("");
    setNote("");
    setStreak(0);
    setBest(0);
    setPeak(0);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr("הדפדפן הזה לא נותן גישה למיקרופון (נדרש חיבור מאובטח, https).");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const Ctor: AC | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AC }).webkitAudioContext;
      if (!Ctor) {
        stream.getTracks().forEach((t) => t.stop());
        setErr("הדפדפן הזה לא תומך בניתוח שמע.");
        return;
      }
      const ctx = new Ctor();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an); // לא מחובר לרמקול, אז אין הדהוד
      await ctx.resume();
      const buf = new Float32Array(an.fftSize);
      let sm = 0;
      let quietMs = 0;
      let bestMs = 0;
      let peakNow = 0;
      let over = false;
      const timer = window.setInterval(() => {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        sm = smooth(sm, rmsToLevel(Math.sqrt(sum / buf.length)));
        const lv = Math.round(sm);
        setLevel(lv);
        if (modeRef.current === "quiet") {
          if (lv <= limitRef.current) {
            quietMs += 100;
            if (over) {
              over = false;
              setNote("חזרתם לשקט");
            }
          } else {
            if (!over && quietMs > 0) setNote("עברתם את הגבול, מתחילים שוב");
            over = true;
            quietMs = 0;
          }
          bestMs = Math.max(bestMs, quietMs);
          setStreak(Math.floor(quietMs / 1000));
          setBest(Math.floor(bestMs / 1000));
        } else if (lv > peakNow) {
          peakNow = lv;
          setPeak(lv);
        }
      }, 100);
      rt.current = { stream, ctx, timer };
      setOn(true);
    } catch (e) {
      const name = (e as { name?: string })?.name;
      setErr(name === "NotAllowedError" ? "אין הרשאה למיקרופון. אפשר לאשר אותה בהגדרות הדפדפן ולנסות שוב." : name === "NotFoundError" ? "לא נמצא מיקרופון במכשיר." : "לא הצלחתי להפעיל את המיקרופון.");
      stop();
    }
  };

  return (
    <div className="f69-body">
      <p className="hint">המדד יחסי ולא מכויל (לא מודד דציבלים אמיתיים של מדרגת רעש). השמע לא נשמר ולא נשלח, והוא נותח רק במכשיר הזה כל עוד המד פועל.</p>
      <fieldset className="f69-fs">
        <legend>סוג המשחק</legend>
        <div className="actions" role="radiogroup" aria-label="סוג המשחק">
          <label className="check">
            <input type="radio" name="f69-noise-mode" checked={mode === "quiet"} onChange={() => setMode("quiet")} />
            <span>משחק שקט (כמה זמן שקטים)</span>
          </label>
          <label className="check">
            <input type="radio" name="f69-noise-mode" checked={mode === "loud"} onChange={() => setMode("loud")} />
            <span>משחק מורל (כמה רעש אפשר)</span>
          </label>
        </div>
      </fieldset>
      {mode === "quiet" && (
        <label className="f69-range">
          <span>גבול הרעש המותר: {limit}</span>
          <input type="range" min={5} max={90} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
        </label>
      )}
      <div className="f69-meter" role="meter" aria-label="עוצמת רעש יחסית" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level} aria-valuetext={`${level} מתוך 100`}>
        <span className="f69-meter-fill" style={{ width: `${level}%` }} />
        {mode === "quiet" && <i className="f69-meter-limit" style={{ insetInlineStart: `${limit}%` }} aria-hidden="true" />}
      </div>
      {mode === "quiet" ? (
        <p className="f69-big">
          שקט רצוף: {streak} שנ׳ <small>· שיא: {best} שנ׳</small>
        </p>
      ) : (
        <p className="f69-big">
          רמה: {level} <small>· שיא: {peak}</small>
        </p>
      )}
      <div className="sr-only" role="status" aria-live="polite">
        {note}
      </div>
      {note && (
        <p className="hint" aria-hidden="true">
          {note}
        </p>
      )}
      {err && (
        <p className="error-box" role="alert">
          {err}
        </p>
      )}
      <button type="button" className="btn field-btn" aria-pressed={on} onClick={on ? stop : start}>
        {on ? "עצירת המד" : "הפעלת מד רעש"}
      </button>
    </div>
  );
}

const rnd = (): number => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
};

function GroupSplitter() {
  const toast = useToast();
  const [raw, setRaw] = useState("");
  const [count, setCount] = useState(20);
  const [by, setBy] = useState<"groups" | "size">("groups");
  const [num, setNum] = useState(4);
  const [out, setOut] = useState<string[][] | null>(null);
  const [err, setErr] = useState("");

  const names = parseNames(raw);
  const people = names.length > 0 ? names : Array.from({ length: Math.max(0, Math.min(200, count)) }, (_, i) => String(i + 1));

  const run = () => {
    if (people.length < 2) {
      setErr("צריך לפחות שני משתתפים.");
      setOut(null);
      return;
    }
    setErr("");
    const k = by === "groups" ? num : groupsForSize(people.length, num);
    setOut(splitGroups(people, k, rnd));
  };
  const copy = async () => {
    if (!out) return;
    const text = out.map((g, i) => `קבוצה ${i + 1}: ${g.join(", ")}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast("החלוקה הועתקה", { kind: "success" });
    } catch {
      toast("לא הצלחתי להעתיק. אפשר לסמן ולהעתיק ידנית", { kind: "error" });
    }
  };

  return (
    <div className="f69-body">
      <p className="hint">החלוקה אקראית והוגנת: גדלי הקבוצות נבדלים לכל היותר באחד. השמות נשארים במכשיר הזה בלבד ולא נשמרים.</p>
      <label className="f69-field">
        <span>שמות (שורה לכל משתתף, לא חובה)</span>
        <textarea rows={4} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="אם משאירים ריק, מחלקים מספרים" />
      </label>
      {names.length === 0 && (
        <label className="f69-field">
          <span>כמה משתתפים</span>
          <input type="number" min={2} max={200} dir="ltr" value={count} onChange={(e) => setCount(Number(e.target.value) || 0)} />
        </label>
      )}
      <fieldset className="f69-fs">
        <legend>איך מחלקים</legend>
        <div className="actions" role="radiogroup" aria-label="איך מחלקים">
          <label className="check">
            <input type="radio" name="f69-split-by" checked={by === "groups"} onChange={() => setBy("groups")} />
            <span>לפי מספר קבוצות</span>
          </label>
          <label className="check">
            <input type="radio" name="f69-split-by" checked={by === "size"} onChange={() => setBy("size")} />
            <span>לפי גודל קבוצה</span>
          </label>
        </div>
      </fieldset>
      <label className="f69-field">
        <span>{by === "groups" ? "מספר הקבוצות" : "גודל קבוצה רצוי"}</span>
        <input type="number" min={1} max={100} dir="ltr" value={num} onChange={(e) => setNum(Math.max(1, Number(e.target.value) || 1))} />
      </label>
      {err && (
        <p className="error-box" role="alert">
          {err}
        </p>
      )}
      <div className="actions">
        <button type="button" className="btn btn-primary field-btn" onClick={run}>
          {out ? "ערבוב מחדש" : "חלוקה לקבוצות"}
        </button>
        {out && (
          <button type="button" className="btn field-btn" onClick={copy}>
            העתקה
          </button>
        )}
      </div>
      {out && (
        <ol className="f69-groups" aria-label="הקבוצות">
          {out.map((g, i) => (
            <li key={i}>
              <strong>
                קבוצה {i + 1} <small>({g.length})</small>
              </strong>
              <span>{g.join(" · ")}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

interface RoomState extends TeamSnap {
  by?: string;
}

function TeamSync({ activityId, snapshot, onRemote, onUnlock }: { activityId: number; snapshot: TeamSnap; onRemote: (s: TeamSnap) => void; onUnlock: () => void }) {
  const { token } = useAuth();
  const toast = useToast();
  const [phase, setPhase] = useState<"idle" | "connecting" | "live">("idle");
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");
  const [members, setMembers] = useState(0);
  const [err, setErr] = useState("");
  const [host, setHost] = useState(false);

  const cid = useRef("");
  if (!cid.current && typeof window !== "undefined") {
    const a = new Uint8Array(8);
    crypto.getRandomValues(a);
    cid.current = Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  const abort = useRef<AbortController | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const codeRef = useRef(code);
  codeRef.current = code;
  const snap = useRef(snapshot);
  snap.current = snapshot;
  const remoteRef = useRef(onRemote);
  remoteRef.current = onRemote;
  const lastRemote = useRef<{ idx: number; running: boolean } | null>(null);

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setPhase("idle");
    setMembers(0);
    setHost(false);
  }, []);
  useEffect(() => stop, [stop]);

  const apply = (s: RoomState) => {
    lastRemote.current = { idx: s.idx, running: s.running };
    remoteRef.current({ idx: s.idx, running: s.running, remaining: s.remaining });
  };

  const connect = useCallback(
    (c: string) => {
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      setErr("");
      setCode(c);
      setPhase("connecting");
      const handle = (event: string, raw: string) => {
        let d: { members?: number; state?: RoomState | null; activityId?: number; by?: string } & Partial<RoomState>;
        try {
          d = JSON.parse(raw);
        } catch {
          return;
        }
        if (typeof d.members === "number") setMembers(d.members);
        if (event === "hello") {
          if (d.activityId && d.activityId !== activityId) {
            setErr("החדר הזה שייך לפעולה אחרת.");
            ac.abort();
            setPhase("idle");
            return;
          }
          setPhase("live");
          if (d.state) apply(d.state);
        } else if (event === "state" && d.by !== cid.current && typeof d.idx === "number") {
          apply({ idx: d.idx, running: !!d.running, remaining: Number(d.remaining) || 0 });
        } else if (event === "closed") {
          setErr("מנהל החדר סגר אותו.");
          ac.abort();
          setPhase("idle");
        }
      };
      void (async () => {
        let wait = 1500;
        while (!ac.signal.aborted) {
          try {
            const res = await fetch(`${API_URL}/api/field/rooms/${encodeURIComponent(c)}/stream?cid=${cid.current}`, {
              headers: { Accept: "text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
              signal: ac.signal,
              cache: "no-store",
            });
            if (res.status === 404 || res.status === 409) {
              setErr(res.status === 404 ? "החדר לא נמצא או שנסגר. בודקים את הקוד?" : "החדר מלא.");
              setPhase("idle");
              return;
            }
            if (!res.ok || !res.body) throw new Error(`http ${res.status}`);
            wait = 1500;
            const reader = res.body.getReader();
            const dec = new TextDecoder();
            let buf = "";
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const parsed = parseSse(buf);
              buf = parsed.rest;
              for (const m of parsed.messages) handle(m.event, m.data);
            }
          } catch {
            if (ac.signal.aborted) return;
          }
          if (ac.signal.aborted) return;
          setPhase("connecting");
          await new Promise((r) => window.setTimeout(r, wait));
          wait = Math.min(wait * 2, 10_000);
        }
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activityId, token],
  );

  // כל שינוי מקומי של שלב או של הפעלה/השהיה נשלח לחדר. שינוי שהגיע מהחדר עצמו לא נשלח חזרה.
  useEffect(() => {
    if (phaseRef.current !== "live" || !codeRef.current) return;
    const lr = lastRemote.current;
    lastRemote.current = null;
    if (lr && lr.idx === snapshot.idx && lr.running === snapshot.running) return;
    const s = snap.current;
    void api(`/api/field/rooms/${codeRef.current}/state`, { method: "POST", body: { cid: cid.current, idx: s.idx, running: s.running, remaining: Math.max(-3600, Math.round(s.remaining)) } }).catch(() => {});
  }, [snapshot.idx, snapshot.running]);

  // קישור הזמנה: ?room=קוד
  useEffect(() => {
    const m = /[?&]room=([A-Za-z0-9]{6})/.exec(window.location.search);
    if (m) connect(m[1].toUpperCase());
  }, [connect]);

  const create = async () => {
    onUnlock();
    setErr("");
    try {
      const r = await api<{ code: string }>("/api/field/rooms", { method: "POST", token, body: { activityId } });
      setHost(true);
      connect(r.code);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const join = () => {
    onUnlock();
    const c = typed.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(c)) {
      setErr("קוד החדר הוא שש אותיות ומספרים.");
      return;
    }
    setHost(false);
    connect(c);
  };
  const close = async () => {
    try {
      await api(`/api/field/rooms/${code}`, { method: "DELETE", token });
    } catch {
      /* ייסגר מעצמו כשהחדר ישן */
    }
    stop();
  };
  const copyLink = async () => {
    const url = `${window.location.origin}/field/${activityId}?room=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("קישור ההזמנה הועתק", { kind: "success" });
    } catch {
      toast("לא הצלחתי להעתיק. הקוד מוצג כאן, אפשר להקליד אותו", { kind: "error" });
    }
  };

  return (
    <div className="f69-body">
      <p className="hint">כל המדריכים בחדר רואים את אותו שלב ואת אותו טיימר, ומי שמזיז שלב או מתחיל טיימר מזיז לכולם. בחדר אין שמות, רק שלב, מצב הטיימר וכמה מחוברים. החדר נשמר בזיכרון השרת בלבד ונעלם כשהשרת נרדם.</p>
      {phase === "idle" ? (
        <>
          <div className="actions">
            <button type="button" className="btn btn-primary field-btn" onClick={create} disabled={!token}>
              פתיחת חדר צוות
            </button>
          </div>
          {!token && <p className="hint">פתיחת חדר זמינה למדריכים מחוברים. אפשר להצטרף לחדר קיים בלי חשבון.</p>}
          <label className="f69-field">
            <span>קוד חדר (שש אותיות ומספרים)</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} maxLength={6} dir="ltr" autoCapitalize="characters" autoComplete="off" />
          </label>
          <button type="button" className="btn field-btn" onClick={join}>
            הצטרפות לחדר
          </button>
        </>
      ) : (
        <>
          <p className="f69-big" dir="ltr">
            {code}
          </p>
          <p role="status">{phase === "live" ? `מחובר. ${members} ${members === 1 ? "מדריך בחדר" : "מדריכים בחדר"}` : "מתחבר מחדש..."}</p>
          <div className="actions">
            <button type="button" className="btn field-btn" onClick={copyLink}>
              העתקת קישור הזמנה
            </button>
            <button type="button" className="btn field-btn" onClick={stop}>
              יציאה מהחדר
            </button>
            {host && (
              <button type="button" className="btn field-btn" onClick={close}>
                סגירת החדר לכולם
              </button>
            )}
          </div>
        </>
      )}
      {err && (
        <p className="error-box" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

export function FieldToolbox({ activityId, snapshot, onRemote, onUnlock }: { activityId: number; snapshot: TeamSnap; onRemote: (s: TeamSnap) => void; onUnlock: () => void }) {
  const [openTeam] = useState(() => typeof window !== "undefined" && /[?&]room=/.test(window.location.search));
  return (
    <section className="field-toolbox" aria-labelledby="f69-h">
      <h2 id="f69-h" className="field-walkie-h">
        ארגז כלי שטח
      </h2>
      <details className="f69-tool">
        <summary>מד רעש חי (משחקי שקט ומורל)</summary>
        <NoiseMeter />
      </details>
      <details className="f69-tool">
        <summary>מחלק קבוצות הוגן</summary>
        <GroupSplitter />
      </details>
      <details className="f69-tool" open={openTeam || undefined}>
        <summary>סנכרון צוות (שלב וטיימר חיים)</summary>
        <TeamSync activityId={activityId} snapshot={snapshot} onRemote={onRemote} onUnlock={onUnlock} />
      </details>
    </section>
  );
}
