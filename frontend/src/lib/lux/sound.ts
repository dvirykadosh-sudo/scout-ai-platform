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
