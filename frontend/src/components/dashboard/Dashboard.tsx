"use client";

// הלוח שלי: מעטפת כהה חצי שקופה, משטח Bento בהיר (4 KPI, כרטיס כתום, התקדמות, תזכורות, גישה מהירה) ופאנל כהה בשמאל.
import Link from "next/link";
import { BellRing, CalendarCheck2, CalendarClock, CalendarHeart, CalendarPlus, Library, PenLine, RefreshCw, Sparkles } from "lucide-react";
import { useAuth } from "../Providers";
import { FeaturedCard, KpiCard, ProgressCard } from "./Cards";
import { MiniBars, MiniLine } from "./Sparkline";
import { SidePanel } from "./SidePanel";
import { inMonth, nextDays, nextOwn, percent, toEvents, weekCounts } from "./dash-calc";
import { DOW_LONG, MONTHS, daysBetween, fmtShort, monthKey, weekdayOf } from "./dates";
import { useDashboardData } from "./useDashboardData";

const QUICK = [
  { href: "/", label: "פעולה חכמה חדשה", icon: Sparkles },
  { href: "/write", label: "כתיבת פעולה משלי", icon: PenLine },
  { href: "/library", label: "מאגר הפעולות", icon: Library },
  { href: "/calendar", label: "יומן הפעולות", icon: CalendarPlus },
];

function Guest() {
  return (
    <div className="db-shell tw:rounded-3xl" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div className="db-work">
        <div className="db-card db-guest">
          <h1 style={{ fontSize: "1.5rem", margin: 0, color: "var(--db-ink)" }}>הלוח שלי</h1>
          <p style={{ color: "var(--db-ink-2)" }}>היומן, התזכורות והסטטיסטיקה האישית שלכם במקום אחד. כדי לראות אותם צריך להתחבר.</p>
          <Link href="/login" className="db-cta" style={{ background: "var(--btn-bg)", color: "var(--on-accent)" }}>כניסה לחשבון</Link>
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { token, user, ready } = useAuth();
  const { data, loading, error, reload } = useDashboardData(token);

  if (!ready) return <p role="status">טוען…</p>;
  if (!user) return <Guest />;
  if (!data) {
    return (
      <div className="db-shell tw:rounded-3xl" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
        <div className="db-work"><h1 style={{ margin: 0, color: "var(--db-ink)" }}>הלוח שלי</h1><p role="status" className="db-empty">{loading ? "טוענים את הנתונים שלך…" : "אין נתונים להצגה."}</p></div>
      </div>
    );
  }

  const { today, schedule, team, reminders, unread, activities } = data;
  const now = new Date();
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dates = schedule.map((s) => s.date);
  const teamDates = team.map((t) => t.date).filter((d) => d >= today);
  const ym = monthKey(today);
  const monthN = inMonth(dates, ym);
  const next14 = dates.filter((d) => d >= today && daysBetween(today, d) < 14).length;
  const open = unread + reminders.length;
  const next = nextOwn(schedule, today, hm);

  const week = schedule.filter((s) => s.date >= today && daysBetween(today, s.date) < 7).length;
  const prepPending = reminders.filter((r) => r.type === "prep").length;
  const past30 = schedule.filter((s) => s.date < today && daysBetween(s.date, today) <= 30).length;
  const logPending = reminders.filter((r) => r.type === "log").length;
  const events = toEvents(schedule, team, reminders);

  return (
    <div className="db-shell tw:rounded-3xl tw:backdrop-blur-xl">
      <div className="db-work">
        <div className="db-head">
          <div>
            <h1>שלום {user.displayName}</h1>
            <p>{DOW_LONG[weekdayOf(today)]}, {fmtShort(today)} · {MONTHS[Number(today.slice(5, 7)) - 1]}</p>
          </div>
          <button type="button" className="db-cta light" onClick={() => void reload()} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" />
            {loading ? "מרענן…" : "רענון"}
          </button>
        </div>
        {error && <p role="alert" className="db-card" style={{ marginBottom: 14 }}>{error}</p>}

        <div className="db-grid">
          <KpiCard label="פעולות ביומן החודש" value={monthN} sub={`ב${MONTHS[Number(today.slice(5, 7)) - 1]}`} icon={CalendarCheck2} chart={<MiniBars values={weekCounts(dates, today, 8, "past")} />} />
          <KpiCard label="ב-14 הימים הקרובים" value={next14} sub="פעולות מתוכננות" icon={CalendarClock} chart={<MiniBars values={weekCounts(dates, today, 8, "future")} highlight={0} />} />
          <KpiCard label="אירועי שבט קרובים" value={teamDates.length} sub="בלוח הצוות" icon={CalendarHeart} chart={<MiniLine values={weekCounts(teamDates, today, 8, "future")} />} />
          <KpiCard label="דורש טיפול" value={open} sub={`${reminders.length} תזכורות · ${unread} התראות`} icon={BellRing} chart={<MiniLine values={nextDays(reminders.map((r) => r.date), today, 7)} />} />

          <FeaturedCard next={next} days={next ? daysBetween(today, next.date) : 0} />
          <ProgressCard title="הכנה לשבוע הקרוב" pct={percent(week - prepPending, week)} note={week ? `${week} פעולות ב-7 הימים הקרובים, ${prepPending} עוד לא הוכנו` : "אין פעולות ב-7 הימים הקרובים"} />
          <ProgressCard title="תיעוד פעולות שהתקיימו" pct={percent(past30 - logPending, past30)} note={past30 ? `${past30} פעולות ב-30 הימים האחרונים, ${logPending} ממתינות לתיעוד` : "אין פעולות שעברו ב-30 הימים האחרונים"} />

          <section className="db-card db-wide" aria-label="תזכורות">
            <h2>תזכורות פתוחות</h2>
            {reminders.length === 0 ? (
              <p className="db-empty">הכל מעודכן. אין תזכורות פתוחות.</p>
            ) : (
              <ul className="db-list">
                {reminders.slice(0, 5).map((r) => (
                  <li key={`${r.id}${r.type}`}>
                    <BellRing size={16} aria-hidden="true" />
                    <Link href="/calendar" style={{ color: "inherit" }}>{r.message || r.title}</Link>
                    <span className="when">{fmtShort(r.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="db-card db-wide" aria-label="גישה מהירה">
            <h2>גישה מהירה</h2>
            <div className="db-quick">
              {QUICK.map((q) => {
                const Icon = q.icon;
                return <Link key={q.href} href={q.href}><Icon size={20} aria-hidden="true" />{q.label}</Link>;
              })}
            </div>
          </section>
        </div>
      </div>

      <SidePanel
        events={events}
        cubes={[
          { label: "פעולות במאגר שלי", value: activities },
          { label: "ביומן החודש", value: monthN },
          { label: "התראות חדשות", value: unread },
          { label: "תזכורות פתוחות", value: reminders.length },
        ]}
      />
    </div>
  );
}
