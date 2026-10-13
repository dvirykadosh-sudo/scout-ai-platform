
"use client";

import { useState } from "react";

const methods = [
  "משחק תחרות",
  "עשייה",
  "ייצוג",
  "הבעה יצירתית",
  "השראה",
  "חשיבה משותפת",
  "דיון בשאלה",
  "שיתוף",
  "משחק הדמייה",
  "התבוננות",
  "הסבר",
  "פירוק",
];

export default function Home() {
  const [tab, setTab] = useState("generator");
  const [selected, setSelected] = useState<string[]>([]);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState(60);

  function toggleMethod(method: string) {
    setSelected((old) =>
      old.includes(method)
        ? old.filter((item) => item !== method)
        : [...old, method]
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#130E26] text-white">
      <header className="border-b border-white/10 bg-[#1E1245]/80 px-6 py-5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-300/30 bg-purple-500/20 text-3xl">
              🦅
            </div>
            <div>
              <h1 className="text-2xl font-black">שבט מעוז</h1>
              <p className="text-sm text-purple-200">Scout AI Platform</p>
            </div>
          </div>
          <nav className="flex flex-wrap gap-2">
            {[
              ["generator", "מחולל פעולות"],
              ["library", "ספריית פעולות"],
              ["methods", "שיטות הדרכה"],
              ["admin", "ניהול"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`rounded-xl px-4 py-3 text-sm font-bold transition ${
                  tab === id
                    ? "bg-purple-600 text-white"
                    : "bg-white/5 text-purple-100 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-10">
        <div className="mb-8">
          <p className="mb-2 text-sm font-bold text-purple-300">
            מערכת חכמה למדריכי הצופים
          </p>
          <h2 className="text-3xl font-black md:text-5xl">
            {tab === "generator" && "בונים פעולה מנצחת"}
            {tab === "library" && "ספריית הפעולות"}
            {tab === "methods" && "שיטות הדרכה"}
            {tab === "admin" && "מרכז ניהול"}
          </h2>
          <p className="mt-3 text-purple-100/70">
            מתכננים, מתאימים ומארגנים פעולות לשכבה שלך.
          </p>
        </div>

        {tab === "generator" && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h3 className="mb-5 text-xl font-bold">פרטי הפעולה</h3>
              <label className="mb-2 block text-sm text-purple-100">
                שם הפעולה
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="לדוגמה: גיבוש שכבה"
                className="mb-5 w-full rounded-xl border border-white/10 bg-[#130E26] p-4 outline-none focus:border-purple-400"
              />

              <label className="mb-2 block text-sm text-purple-100">
                שם השבט
              </label>
              <input
                defaultValue="מעוז"
                className="mb-5 w-full rounded-xl border border-white/10 bg-[#130E26] p-4 outline-none focus:border-purple-400"
              />

              <label className="mb-2 block text-sm text-purple-100">
                גדוד
              </label>
              <input
                placeholder="שם הגדוד"
                className="mb-5 w-full rounded-xl border border-white/10 bg-[#130E26] p-4 outline-none focus:border-purple-400"
              />

              <label className="mb-2 block text-sm text-purple-100">
                שם המדריך
              </label>
              <input
                placeholder="שם מלא"
                className="mb-5 w-full rounded-xl border border-white/10 bg-[#130E26] p-4 outline-none focus:border-purple-400"
              />

              <label className="mb-2 block text-sm text-purple-100">
                תפקיד
              </label>
              <select className="mb-5 w-full rounded-xl border border-white/10 bg-[#130E26] p-4">
                <option>מדריך</option>
                <option>ראש גדוד</option>
                <option>מרכז שבט</option>
              </select>

              <label className="mb-2 block text-sm text-purple-100">
                שכבת גיל
              </label>
              <select className="mb-5 w-full rounded-xl border border-white/10 bg-[#130E26] p-4">
                <option>שכבת ה׳</option>
                <option>שכבת ו׳</option>
                <option>שכבת ז׳</option>
                <option>שכבת ח׳</option>
                <option>שכבת ט׳</option>
                <option>שכבת י׳</option>
              </select>

              <label className="mb-2 block text-sm text-purple-100">
                מספר חניכים
              </label>
              <input
                type="number"
                min={1}
                defaultValue={20}
                className="mb-5 w-full rounded-xl border border-white/10 bg-[#130E26] p-4"
              />

              <label className="mb-2 block text-sm text-purple-100">
                משך הפעולה בדקות
              </label>
              <input
                type="number"
                min={5}
                value={total}
                onChange={(e) => setTotal(Number(e.target.value))}
                className="w-full rounded-xl border border-white/10 bg-[#130E26] p-4"
              />

              <div className="mt-6 space-y-4">
                <label className="flex items-center justify-between gap-3 rounded-xl bg-white/5 p-4">
                  <span>זמן צופיות מעשי</span>
                  <input type="checkbox" className="h-5 w-5 accent-purple-500" />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl bg-white/5 p-4">
                  <span>מצב תנועתי</span>
                  <input type="checkbox" className="h-5 w-5 accent-purple-500" />
                </label>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h3 className="text-xl font-bold">שיטות הדרכה</h3>
              <p className="mb-5 mt-2 text-sm text-purple-100/60">
                בחר שיטות והגדר לכל שיטה את משך הזמן בדקות.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {methods.map((method, index) => {
                  const active = selected.includes(method);
                  return (
                    <div
                      key={method}
                      className={`rounded-2xl border p-4 transition ${
                        active
                          ? "border-purple-400 bg-purple-500/15"
                          : "border-white/10 bg-black/10"
                      }`}
                    >
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleMethod(method)}
                          className="h-5 w-5 accent-purple-500"
                        />
                        <span className="text-sm font-bold">
                          <span className="ml-2 text-purple-300">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          {method}
                        </span>
                      </label>
                      {active && (
                        <div className="mt-4">
                          <label className="mb-2 block text-xs text-purple-200">
                            משך השיטה בדקות
                          </label>
                          <input
                            type="number"
                            min={1}
                            required
                            value={durations[method] ?? ""}
                            onChange={(e) =>
                              setDurations((old) => ({
                                ...old,
                                [method]: Number(e.target.value),
                              }))
                            }
                            placeholder="הזן דקות"
                            className="w-full rounded-lg border border-purple-400/30 bg-[#130E26] p-3"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 rounded-2xl border border-purple-400/20 bg-purple-500/10 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-purple-100/70">משך הפעולה</span>
                  <strong>{total} דקות</strong>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-purple-100/70">זמן בשיטות שנבחרו</span>
                  <strong>
                    {selected.reduce((sum, m) => sum + (durations[m] || 0), 0)} דקות
                  </strong>
                </div>
                <button
                  onClick={() =>
                    alert(
                      "מסך הבסיס מוכן. בשלב הבא נחבר את המחולל למערכת השרת וליצירת הפעולה."
                    )
                  }
                  className="mt-5 w-full rounded-xl bg-purple-600 px-5 py-4 font-black transition hover:bg-purple-500"
                >
                  הכנת הפעולה
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "library" && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              "פעולת שיא",
              "גיבוש שכבה",
              "מנהיגות ואחריות",
              "אלימות בקרב בני נוער",
              "בריונות",
              "תחבורה ציבורית בשבת",
            ].map((name) => (
              <article
                key={name}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"
              >
                <div className="mb-4 text-2xl">📘</div>
                <h3 className="font-bold">{name}</h3>
                <p className="mt-2 text-sm text-purple-100/60">
                  פעולת הדרכה לשבט מעוז
                </p>
              </article>
            ))}
          </div>
        )}

        {tab === "methods" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {methods.map((method, i) => (
              <article
                key={method}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
              >
                <p className="mb-3 text-sm text-purple-300">
                  שיטה {i + 1}
                </p>
                <h3 className="text-lg font-bold">{method}</h3>
              </article>
            ))}
          </div>
        )}

        {tab === "admin" && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8">
            <h3 className="text-xl font-bold">לוח בקרה</h3>
            <p className="mt-3 text-purple-100/70">
              מסך הבסיס מוכן. נתוני משתמשים, הרשאות ופעולות יופיעו לאחר חיבור השרת.
            </p>
          </div>
        )}
      </section>

      <footer className="border-t border-white/10 px-5 py-6 text-center text-sm text-purple-100/50">
        שבט מעוז · מערכת תכנון פעולות לצופים
      </footer>
    </main>
  );
}