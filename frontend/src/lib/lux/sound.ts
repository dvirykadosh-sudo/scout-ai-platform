// שלב 61 (רעיון 5): צלילי אווירה ומשוב פיזי. הכול מסונתז ב-WebAudio, בלי קבצי שמע.
// כבוי כברירת מחדל. מתחיל רק אחרי לחיצה של המשתמש. לא פועל במצב חיסכון בנתונים.

const KEY = "scout.sound"; // "1" = צלילים פעילים
const FIRE = "scout.sound.fire"; // "1" = מדורה ברקע
const HAPTIC = "scout.haptics"; // "0" = כבוי

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

export interface SoundPrefs {
  on: boolean;
  fire: boolean;
  haptics: boolean;
}
export const getSoundPrefs = (): SoundPrefs => ({ on: read(KEY) === "1", fire: read(FIRE) === "1", haptics: read(HAPTIC) !== "0" });
export function setSoundPrefs(p: Partial<SoundPrefs>): SoundPrefs {
  if (p.on !== undefined) write(KEY, p.on ? "1" : "0");
  if (p.fire !== undefined) write(FIRE, p.fire ? "1" : "0");
  if (p.haptics !== undefined) write(HAPTIC, p.haptics ? "1" : "0");
  const next = getSoundPrefs();
  if (!next.on) stopFire();
  if (typeof window !== "undefined") window.dispatchEvent(new Event("scout:sound"));
  return next;
}

type AC = typeof AudioContext;
let ctx: AudioContext | null = null;
export function unlock(): AudioContext | null {
  try {
    if (!ctx) {
      const C: AC | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AC }).webkitAudioContext;
      if (C) ctx = new C();
    }
    void ctx?.resume();
    return ctx;
  } catch {
    return null;
  }
}
const saver = () => typeof document !== "undefined" && document.documentElement.classList.contains("saver");

/** רטט קצר. בכוונה לא תלוי בצליל: טלפון בשקט עדיין מרגיש. */
export function buzz(pattern: number | number[]): void {
  try {
    if (getSoundPrefs().haptics) navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

/** שריקת סיום: שתי שריקות עם רטט קל בגובה הצליל. */
export function whistle(): void {
  const c = getSoundPrefs().on ? unlock() : null;
  if (!c) return;
  try {
    [0, 0.5].forEach((d) => {
      const t = c.currentTime + d;
      const o = c.createOscillator();
      const lfo = c.createOscillator();
      const lfoGain = c.createGain();
      const g = c.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(2050, t);
      o.frequency.linearRampToValueAtTime(2450, t + 0.38);
      lfo.frequency.value = 34;
      lfoGain.gain.value = 70;
      lfo.connect(lfoGain);
      lfoGain.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      o.connect(g);
      g.connect(c.destination);
      o.start(t);
      lfo.start(t);
      o.stop(t + 0.45);
      lfo.stop(t + 0.45);
    });
  } catch {
    /* ignore */
  }
}

/** צלצול רך: "נשארה דקה" או מעבר שלב. */
export function chime(high = false): void {
  const c = getSoundPrefs().on ? unlock() : null;
  if (!c) return;
  try {
    const notes = high ? [784, 1175] : [523, 659];
    notes.forEach((f, i) => {
      const t = c.currentTime + i * 0.14;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g);
      g.connect(c.destination);
      o.start(t);
      o.stop(t + 0.55);
    });
  } catch {
    /* ignore */
  }
}

/* ───────── שלב 71: אפקטים של זירת המשחק. אותם כללים: כבוי כברירת מחדל, אחרי לחיצה, לא במצב חיסכון ──────── */

type Wave = OscillatorType;
/** צליל קצר אחד. מחזיר false כשהצלילים כבויים. */
function note(freq: number, at: number, dur: number, type: Wave = "sine", vol = 0.2, slideTo?: number): boolean {
  const c = getSoundPrefs().on && !saver() ? unlock() : null;
  if (!c) return false;
  try {
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
    return true;
  } catch {
    return false;
  }
}

/** תשובה נכונה: עלייה עליזה של שלושה צלילים. */
export function correct(): void {
  [523, 659, 880].forEach((f, i) => note(f, i * 0.09, 0.28, "triangle", 0.22));
}
/** תשובה שגויה: ירידה רכה (לא מבהילה ולא משפילה). */
export function wrong(): void {
  note(330, 0, 0.32, "sine", 0.2, 220);
}
/** תקתוק של טיימר או של פלח בגלגל. step מזיז מעט את הגובה כדי שלא יישמע כמו מכונה. */
export function tick(step = 0): void {
  note(1100 + (step % 5) * 40, 0, 0.05, "square", 0.05);
}
/** עלייה בניקוד: קפיצה קטנה. */
export function scoreUp(big = false): void {
  note(big ? 698 : 587, 0, 0.12, "triangle", 0.2);
  note(big ? 1047 : 880, 0.08, 0.2, "triangle", 0.2);
}
/** תרועת סיום: פנפרה קצרה. */
export function fanfare(): void {
  [392, 392, 392, 523, 659, 784].forEach((f, i) => note(f, i * (i < 3 ? 0.11 : 0.16) + (i > 2 ? 0.05 : 0), i === 5 ? 0.7 : 0.22, "triangle", 0.24));
}
/** פתיחת גלגל או שאלה: "וווש" עולה. */
export function whoosh(): void {
  note(220, 0, 0.35, "sawtooth", 0.06, 880);
}

/* ───────── מדורה: רעש מסונן + נקישות אקראיות ───────── */
let fire: { stop: () => void } | null = null;
export const isFireOn = () => fire !== null;

export function startFire(): boolean {
  if (fire || saver() || !getSoundPrefs().on) return false;
  const c = unlock();
  if (!c) return false;
  try {
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // רעש חום: נמוך ורך
      d[i] = last * 3.5;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const master = c.createGain();
    master.gain.setValueAtTime(0.0001, c.currentTime);
    master.gain.exponentialRampToValueAtTime(0.16, c.currentTime + 1.2);
    src.connect(lp);
    lp.connect(master);
    master.connect(c.destination);
    src.start();

    let alive = true;
    const crackle = () => {
      if (!alive || !ctx) return;
      try {
        const t = ctx.currentTime;
        const n = ctx.createBufferSource();
        const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
        const nd = nb.getChannelData(0);
        for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nd.length, 3);
        n.buffer = nb;
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 1800 + Math.random() * 2500;
        const g = ctx.createGain();
        g.gain.value = 0.05 + Math.random() * 0.14;
        n.connect(hp);
        hp.connect(g);
        g.connect(ctx.destination);
        n.start(t);
      } catch {
        /* ignore */
      }
      window.setTimeout(crackle, 90 + Math.random() * 700);
    };
    crackle();

    fire = {
      stop: () => {
        alive = false;
        try {
          master.gain.cancelScheduledValues(c.currentTime);
          master.gain.setValueAtTime(master.gain.value, c.currentTime);
          master.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5);
          src.stop(c.currentTime + 0.6);
        } catch {
          /* ignore */
        }
      },
    };
    return true;
  } catch {
    return false;
  }
}
export function stopFire(): void {
  fire?.stop();
  fire = null;
}
