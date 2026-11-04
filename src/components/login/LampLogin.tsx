"use client";

// מסך הכניסה: נשר השבט בחושך, חוט משיכה קפיצי. משיכה מדליקה אלומת אור חמה, והנשר "מאיר" על כרטיס הכניסה.
// הטופס הוא אותו LoginForm של /account (אותה כניסה, כולל 2FA ושחזור סיסמה). אחרי הצלחה עוברים ללוח הבקרה.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LoginForm } from "../AuthForms";
import { useAuth } from "../Providers";
import { PullString } from "./PullString";

const SPRING = { type: "spring" as const, stiffness: 200, damping: 20 };
const DIM = "brightness(0.22) saturate(0.5) drop-shadow(0 0 0 rgba(255,190,90,0))";
const LIT = "brightness(1.05) saturate(1.1) drop-shadow(0 0 38px rgba(255,190,90,0.7))";

/** יעד אחרי כניסה: רק נתיב פנימי באתר (מונע הפניה לאתר זר) */
export const safeNext = (n: string | null): string => (n && /^\/(?!\/)[\w\-./%~]*$/.test(n) ? n : "/dashboard");

export function LampLogin() {
  const reduce = useReducedMotion();
  const router = useRouter();
  const { user, ready, clear } = useAuth();
  const [on, setOn] = useState(false);
  const byUser = useRef(false);
  const card = useRef<HTMLDivElement>(null);

  // מי שביקש להפחית תנועה מקבל מסך דלוק מההתחלה
  useEffect(() => {
    if (reduce) setOn(true);
  }, [reduce]);

  // אחרי הדלקה יזומה, המקלדת עוברת לשדה הראשון בטופס
  useEffect(() => {
    if (!on || !byUser.current) return;
    const t = window.setTimeout(() => card.current?.querySelector<HTMLElement>("input")?.focus(), reduce ? 0 : 450);
    return () => window.clearTimeout(t);
  }, [on, reduce]);

  const toggle = () => {
    byUser.current = true;
    setOn((v) => !v);
  };
  const done = () => router.push(safeNext(new URLSearchParams(window.location.search).get("next")));

  return (
    <div className="lg-root">
      <Link href="/" className="lg-back">← חזרה לאתר</Link>
      <h1 className="sh-only-sr">כניסה לשבט מעוז</h1>

      <div className="lg-stage">
        <AnimatePresence>
          {on && (
            <motion.div key="halo" className="lg-halo" aria-hidden="true" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={SPRING} />
          )}
        </AnimatePresence>
        <motion.img
          src="/logo-maoz.png"
          alt="נשר שבט מעוז"
          width={230}
          height={230}
          className="lg-eagle"
          draggable={false}
          initial={false}
          animate={{ filter: on ? LIT : DIM }}
          transition={{ duration: reduce ? 0 : 0.7 }}
        />
        <AnimatePresence>
          {on && (
            <motion.div key="beam" className="lg-beam" aria-hidden="true" initial={{ opacity: 0, scaleY: 0.05 }} animate={{ opacity: 1, scaleY: 1 }} exit={{ opacity: 0, scaleY: 0.05 }} transition={SPRING} />
          )}
        </AnimatePresence>
        <PullString on={on} onToggle={toggle} />
      </div>

      <p className="lg-hint" aria-live="polite">{on ? "" : "משכו את החוט כדי להאיר את הנשר"}</p>

      <AnimatePresence>
        {on && (
          <motion.div key="card" ref={card} className="lg-card" initial={{ opacity: 0, y: 36, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.97 }} transition={SPRING}>
            {ready && user ? (
              <div>
                <h2 style={{ marginTop: 0 }}>כבר מחוברים</h2>
                <p>מחוברים בתור {user.displayName}.</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <Link href="/dashboard" className="btn">ללוח שלי</Link>
                  <button type="button" className="btn" onClick={clear}>התנתקות</button>
                </div>
              </div>
            ) : (
              <>
                <LoginForm title="כניסה לשבט מעוז" onDone={done} />
                <p className="lg-note">אין עדיין חשבון? <Link href="/account">הרשמה באזור האישי</Link></p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
