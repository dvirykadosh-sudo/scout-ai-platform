"use client";

// שלב 68: גל קול מונפש. עיצוב בלבד (aria-hidden): הוא משקף מצב (האזנה, הקראה, חשיבה) ולא עוצמת קול אמיתית.
// בהפחתת תנועה, בחיסכון ובניגודיות גבוהה הוא סטטי; המצב נשמע לקורא מסך דרך שורת המצב שלידו.
export type WavePhase = "idle" | "listening" | "thinking" | "speaking";

export function Waveform({ phase, bars = 26 }: { phase: WavePhase; bars?: number }) {
  return (
    <span className="maoz-wave" data-phase={phase} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} style={{ ["--i" as string]: i, ["--h" as string]: (0.28 + 0.72 * Math.abs(Math.sin(i * 1.7 + 0.6))).toFixed(2) }} />
      ))}
    </span>
  );
}
