"use client";

// כרטיסי הדשבורד: KPI עם תרשים קטן, כרטיס כתום בולט, וכרטיס התקדמות. לכולם קפיצה קלה במעבר עכבר.
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CalendarClock, MapPin, Plus } from "lucide-react";
import type { ScheduleItem } from "@/lib/organizer";
import { fmtLong } from "./dates";
import { relDay } from "./dash-calc";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

const lift = { y: -5 };
const spring = { type: "spring" as const, stiffness: 300, damping: 22 };

export function KpiCard({ label, value, sub, icon: Icon, chart }: { label: string; value: number | string; sub: string; icon: LucideIcon; chart: ReactNode }) {
  return (
    <motion.section className="db-card tw:flex tw:flex-col" whileHover={lift} transition={spring} aria-label={label}>
      <span className="db-kpi-ic" aria-hidden="true"><Icon size={20} /></span>
      <h2>{label}</h2>
      <span className="db-kpi-num">{value}</span>
      <span className="db-kpi-sub">{sub}</span>
      {chart}
    </motion.section>
  );
}

export function FeaturedCard({ next, days }: { next: ScheduleItem | null; days: number }) {
  return (
    <motion.section className="db-card db-feature tw:bg-linear-to-br tw:from-orange-500 tw:to-amber-500 tw:rounded-3xl" whileHover={lift} transition={spring} aria-label="הפעולה הבאה שלך">
      <h2>הפעולה הבאה שלך</h2>
      {next ? (
        <>
          <p className="big">{next.title}</p>
          <div className="meta">
            <span className="db-chip"><CalendarClock size={16} aria-hidden="true" />{fmtLong(next.date)}{next.time ? ` · ${next.time}` : ""}</span>
            <span className="db-chip">{relDay(days)}</span>
            {next.groupLabel && <span className="db-chip"><MapPin size={16} aria-hidden="true" />{next.groupLabel}</span>}
          </div>
          <div className="tw:flex tw:flex-wrap tw:gap-2">
            <Link href={next.activityId ? `/library/${next.activityId}` : "/calendar"} className="db-cta">
              {next.activityId ? "פתיחת הפעולה" : "ליומן"}
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="big">אין עדיין פעולה מתוכננת</p>
          <p>צרו פעולה חכמה בחמישה שלבים ושבצו אותה ביומן.</p>
          <div className="tw:flex tw:flex-wrap tw:gap-2">
            <Link href="/" className="db-cta"><Plus size={18} aria-hidden="true" />פעולה חכמה חדשה</Link>
          </div>
        </>
      )}
    </motion.section>
  );
}

/** כרטיס התקדמות עם פס. pct=null: אין נתונים להצגה */
export function ProgressCard({ title, pct, note }: { title: string; pct: number | null; note: string }) {
  const shown = pct ?? 100;
  return (
    <motion.section className="db-card db-progress" whileHover={lift} transition={spring} aria-label={title}>
      <h2>{title}</h2>
      <span className="db-kpi-num">{pct === null ? "—" : `${pct}%`}</span>
      <div className="db-bar" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={shown}>
        <i style={{ width: `${shown}%` }} />
      </div>
      <span className="db-kpi-sub">{note}</span>
    </motion.section>
  );
}
