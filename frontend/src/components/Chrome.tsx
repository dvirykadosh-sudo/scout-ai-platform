"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useA11y } from "./Providers";

const NAV = [
  { href: "/", label: "יצירת פעולה חכמה" },
  { href: "/library", label: "מאגר פעולות קיים" },
  { href: "/methods", label: "ספריית המתודות" },
  { href: "/admin", label: "לוח בקרה לאדמין" },
];

const LOGO_URL = process.env.NEXT_PUBLIC_LOGO_URL;

function Emblem() {
  return (
    <div className={`emblem ${LOGO_URL ? "has-logo" : ""}`}>
      {LOGO_URL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="emblem-logo" src={LOGO_URL} alt="סמל שבט מעוז" />
      ) : (
        <svg className="emblem-art" viewBox="0 0 440 190" role="img" aria-label="סמל נשר (מקום שמור ללוגו השבט)">
          <defs>
            <linearGradient id="wing" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#8E6BD1" />
              <stop offset="0.55" stopColor="#3b2a78" />
              <stop offset="1" stopColor="#1E1245" />
            </linearGradient>
            <linearGradient id="crest" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2a1766" />
              <stop offset="1" stopColor="#170d38" />
            </linearGradient>
          </defs>
          <g id="wingR" fill="url(#wing)" stroke="#b27cff" strokeWidth="1.5" strokeLinejoin="round">
            <path d="M232 46 C275 30 345 22 428 62 C392 62 372 78 362 98 C348 88 332 90 320 104 C308 96 294 98 284 112 C270 104 256 112 244 128 L232 150 Z" />
          </g>
          <g transform="translate(440 0) scale(-1 1)" fill="url(#wing)" stroke="#b27cff" strokeWidth="1.5" strokeLinejoin="round">
            <path d="M232 46 C275 30 345 22 428 62 C392 62 372 78 362 98 C348 88 332 90 320 104 C308 96 294 98 284 112 C270 104 256 112 244 128 L232 150 Z" />
          </g>
          <path d="M220 8 L242 36 L232 46 H208 L198 36 Z" fill="#5D2FA3" stroke="#d9c2ff" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M212 22 L220 30 L228 22" fill="none" stroke="#efe9ff" strokeWidth="2" strokeLinecap="round" />
          <rect x="118" y="62" width="204" height="76" rx="16" fill="url(#crest)" stroke="#b27cff" strokeWidth="2" />
        </svg>
      )}
      <p className="brand-title">מחולל פעולות</p>
    </div>
  );
}

export function SiteHeader() {
  const { highContrast, largeText, toggleContrast, toggleLarge } = useA11y();
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="site-header">
      <div className="a11y-bar" role="group" aria-label="הגדרות נגישות">
        <button type="button" className="a11y-btn" aria-pressed={highContrast} onClick={toggleContrast}>
          ניגודיות גבוהה
        </button>
        <button type="button" className="a11y-btn" aria-pressed={largeText} onClick={toggleLarge}>
          הגדלת טקסט
        </button>
      </div>
      <Link href="/" className="brand-link" aria-label="מחולל פעולות, שבט מעוז. לעמוד הראשי">
        <Emblem />
      </Link>
      <nav className="nav" aria-label="ניווט ראשי">
        <ul>
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} aria-current={isActive(n.href) ? "page" : undefined}>
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>כל הזכויות שמורות לשבט מעוז - ראשון לציון © 2026</p>
    </footer>
  );
}
