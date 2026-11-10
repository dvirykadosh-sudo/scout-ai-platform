"use client";

// שלב 61 (רעיון 13 + 10): סט איורי צופים מקוריים (קו + צבע הדגש של האתר) והנשר "מעוז".
// כל האיורים: aria-hidden כשהם קישוט, צבעים מ-currentColor ומ---lx-a, ולכן עובדים בכהה, בבהיר ובניגודיות גבוהה.
import type { ReactNode } from "react";

type P = { size?: number; className?: string; title?: string };
const base = (size: number, className: string | undefined, title: string | undefined, children: ReactNode, vb = "0 0 96 96") => (
  <svg viewBox={vb} width={size} height={size} className={`lux-illus ${className ?? ""}`} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const A = "var(--lx-a, #f97316)";

export const Campfire = ({ size = 96, className, title }: P) =>
  base(size, className, title, <>
    <path d="M48 14c6 10 16 16 16 30a16 16 0 01-32 0c0-8 4-12 8-18 2 6 5 8 8 10-1-8-2-14 0-22z" fill={A} fillOpacity=".28" stroke={A} />
    <path d="M48 44c3 5 8 7 8 13a8 8 0 01-16 0c0-4 3-6 8-13z" fill={A} fillOpacity=".6" stroke="none" />
    <path d="M20 84l56-14M76 84L20 70" />
    <path d="M14 88h68" opacity=".5" />
  </>);

export const Compass = ({ size = 96, className, title }: P) =>
  base(size, className, title, <>
    <circle cx="48" cy="48" r="32" />
    <circle cx="48" cy="48" r="26" opacity=".35" strokeWidth="1.5" />
    <path d="M48 20v6M48 70v6M20 48h6M70 48h6" />
    <path d="M60 36L53 53 36 60l7-17z" fill={A} fillOpacity=".4" stroke={A} />
    <circle cx="48" cy="48" r="3" fill="currentColor" stroke="none" />
  </>);

export const Knot = ({ size = 96, className, title }: P) =>
  base(size, className, title, <>
    <path d="M14 62c0-18 14-24 22-24 10 0 12 12 12 12s2 12 12 12c8 0 22-6 22-24" opacity=".55" />
    <path d="M14 34c0 18 14 24 22 24 10 0 12-12 12-12s2-12 12-12c8 0 22 6 22 24" stroke={A} />
    <path d="M10 34h8M78 62h8" strokeWidth="5" />
  </>);

export const Tent = ({ size = 96, className, title }: P) =>
  base(size, className, title, <>
    <path d="M10 78L48 20l38 58z" fill={A} fillOpacity=".16" stroke={A} />
    <path d="M48 20v58M48 78l-14 0 14-30 14 30" />
    <path d="M6 82h84" opacity=".5" />
    <path d="M48 20v-8l8 3-8 3" fill="currentColor" strokeWidth="2" />
  </>);

export const Flag = ({ size = 96, className, title }: P) =>
  base(size, className, title, <>
    <path d="M26 86V12" />
    <path d="M26 14c14-6 20 6 34 0v30c-14 6-20-6-34 0z" fill={A} fillOpacity=".3" stroke={A} />
    <path d="M18 86h16" opacity=".5" />
  </>);

export const Backpack = ({ size = 96, className, title }: P) =>
  base(size, className, title, <>
    <path d="M30 34a18 18 0 0136 0v44a6 6 0 01-6 6H36a6 6 0 01-6-6z" fill={A} fillOpacity=".14" stroke={A} />
    <path d="M38 20a10 10 0 0120 0M36 56h24v18H36zM44 56v-6h8v6" />
  </>);

export const TrailMap = ({ size = 96, className, title }: P) =>
  base(size, className, title, <>
    <path d="M14 20l22 6 24-8 22 6v52l-22-6-24 8-22-6z" opacity=".5" />
    <path d="M36 26v52M60 18v52" opacity=".3" strokeWidth="2" />
    <path d="M22 66c10-4 12-14 22-14s10 10 22 6" stroke={A} strokeDasharray="2 6" />
    <circle cx="66" cy="58" r="5" fill={A} stroke="none" />
  </>);

export const Star = ({ size = 96, className, title }: P) =>
  base(size, className, title, <path d="M48 12l10 22 24 3-18 16 5 24-21-12-21 12 5-24L14 37l24-3z" fill={A} fillOpacity=".25" stroke={A} />);

export const ILLUS = { campfire: Campfire, compass: Compass, knot: Knot, tent: Tent, flag: Flag, backpack: Backpack, trail: TrailMap, star: Star } as const;
export type IllusName = keyof typeof ILLUS;

/** מצב ריק עם איור, כותרת וטקסט. children = כפתור פעולה. */
export function EmptyState({ kind = "campfire", title, text, children }: { kind?: IllusName; title: string; text?: string; children?: ReactNode }) {
  const I = ILLUS[kind];
  return (
    <div className="lux-empty" role="status">
      <I size={104} className="lux-empty-art" />
      <h2 className="lux-empty-title">{title}</h2>
      {text && <p>{text}</p>}
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

/* ───────────── הנשר "מעוז" ───────────── */
export type EagleMood = "idle" | "cheer" | "think" | "wave";

export function Eagle({ mood = "idle", size = 96, className, title }: { mood?: EagleMood; size?: number; className?: string; title?: string }) {
  const up = mood === "cheer";
  const wave = mood === "wave";
  const eyes =
    mood === "cheer" ? (
      <>
        <path d="M48 40q4-6 8 0M64 40q4-6 8 0" stroke="#2b1a0b" strokeWidth="2.6" fill="none" />
      </>
    ) : (
      <>
        <circle cx="52" cy="39" r="3.4" fill="#2b1a0b" stroke="none" />
        <circle cx="68" cy="39" r="3.4" fill="#2b1a0b" stroke="none" />
        <circle cx="53" cy="38" r="1.1" fill="#fff" stroke="none" />
        <circle cx="69" cy="38" r="1.1" fill="#fff" stroke="none" />
      </>
    );
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={`lux-eagle lux-eagle-${mood} ${className ?? ""}`} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false" strokeLinecap="round" strokeLinejoin="round">
      {/* כנפיים */}
      <g className="eg-wing eg-wing-l" fill="#8a5a2b" stroke="#5b3a1a" strokeWidth="2">
        {up ? <path d="M36 64C18 54 8 38 12 22c14 4 28 16 34 34z" /> : <path d="M34 62C16 68 10 86 18 100c10-6 18-16 22-30z" />}
      </g>
      <g className="eg-wing eg-wing-r" fill="#8a5a2b" stroke="#5b3a1a" strokeWidth="2">
        {up || wave ? <path d="M84 64C102 54 112 38 108 22c-14 4-28 16-34 34z" /> : <path d="M86 62c18 6 24 24 16 38-10-6-18-16-22-30z" />}
      </g>
      {/* גוף */}
      <path d="M60 52C42 52 34 68 36 86c2 14 12 22 24 22s22-8 24-22c2-18-6-34-24-34z" fill="#a06a35" stroke="#5b3a1a" strokeWidth="2" />
      <ellipse cx="60" cy="90" rx="14" ry="15" fill="#f1d4a6" />
      {/* רגליים */}
      <path d="M50 108v6M44 114h12M70 108v6M64 114h12" stroke="#d98a0b" strokeWidth="3" fill="none" />
      {/* ראש */}
      <circle cx="60" cy="40" r="21" fill="#fdf3e0" stroke="#5b3a1a" strokeWidth="2" />
      <path d="M50 21c2-6 6-9 10-9s8 3 10 9c-6-3-14-3-20 0z" fill="#fdf3e0" stroke="#5b3a1a" strokeWidth="2" />
      {mood === "think" && <path d="M46 31l12-3M74 31L62 28" stroke="#5b3a1a" strokeWidth="2.4" fill="none" />}
      {eyes}
      {/* מקור */}
      <path d="M53 45h14l-7 15z" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
      {mood === "cheer" && <path d="M55 52h10" stroke="#7c2d12" strokeWidth="2" fill="none" />}
      {/* אזקת צופים (מטפחת) */}
      <path d="M42 64h36L60 86z" fill={A} stroke="#9a3412" strokeWidth="2" />
      <circle cx="60" cy="67" r="3" fill="#fde68a" stroke="none" />
      {mood === "think" && <path d="M40 58c-4 6 2 10 8 8" fill="none" stroke="#5b3a1a" strokeWidth="3" />}
      {up && (
        <g className="eg-confetti" stroke="none">
          <circle cx="14" cy="14" r="3" fill="#f97316" />
          <rect x="100" y="10" width="6" height="6" rx="1" fill="#a78bfa" />
          <circle cx="104" cy="40" r="2.6" fill="#facc15" />
          <rect x="8" y="42" width="5" height="5" rx="1" fill="#34d399" />
        </g>
      )}
    </svg>
  );
}
