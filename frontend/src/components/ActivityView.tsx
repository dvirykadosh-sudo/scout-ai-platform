import type { Activity } from "@/lib/types";

export function StageTable({ stages }: { stages: Activity["stages"] }) {
  return (
    <div className="table-wrap">
      <table className="stage-table">
        <caption className="sr-only">שלבי הפעולה</caption>
        <thead>
          <tr>
            <th scope="col">זמן / שלב</th>
            <th scope="col">שכבה חינוכית</th>
            <th scope="col">תוכן</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((s) => (
            <tr key={s.name}>
              <th scope="row" data-label="זמן / שלב">
                {s.name}
                <span className="stage-min">{s.minutes} דקות</span>
              </th>
              <td data-label="שכבה חינוכית">{s.layer}</td>
              <td data-label="תוכן" className="stage-content">
                {s.content}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ActivityMeta({ a }: { a: Activity }) {
  const who = a.instructor || a.author;
  return (
    <ul className="chips" aria-label="פרטי הפעולה">
      <li className="chip">{a.durationMin} דקות</li>
      <li className="chip">{a.ageGroup}</li>
      <li className="chip">{a.groupSize} משתתפים</li>
      <li className="chip">ערך: {a.leadingValue}</li>
      {who && <li className="chip">מאת {who}</li>}
      {a.energeticMode && <li className="chip chip-accent">מצב תנועתי</li>}
      {a.activeScouting && <li className="chip chip-accent">צופיות מעשית</li>}
    </ul>
  );
}

export function ActivityBody({ a }: { a: Activity }) {
  return (
    <>
      <dl className="facts">
        <div>
          <dt>ציוד</dt>
          <dd>{a.equipment}</dd>
        </div>
        <div className="safety">
          <dt>בטיחות ורגישות</dt>
          <dd>{a.safetyNotes}</dd>
        </div>
      </dl>
      <StageTable stages={a.stages} />
      {a.conclusionNote && <p className="conclusion">{a.conclusionNote}</p>}
    </>
  );
}

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

/** The four things a guide checks first, readable at a glance. */
export function ActivityGlance({ a }: { a: Activity }) {
  const noGear = /^(אין|ללא)/.test(a.equipment.trim());
  const cells = [
    { label: "משך", value: `${a.durationMin} דקות`, d: "M12 6v6l4 2M12 21a9 9 0 100-18 9 9 0 000 18z" },
    { label: "גיל", value: a.ageGroup.replace("כיתה ", ""), d: "M17 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M10 10a4 4 0 100-8 4 4 0 000 8zM21 20v-2a4 4 0 00-3-3.9M16 2.1a4 4 0 010 7.8" },
    { label: "ערך", value: a.leadingValue, d: "M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z" },
    { label: "ציוד", value: noGear ? "בלי ציוד" : a.equipment, d: "M6 8a6 6 0 0112 0v13H6V8zM9 21v-7h6v7" },
  ];
  return (
    <dl className="glance" aria-label="פרטי הפעולה במבט מהיר">
      {cells.map((c) => (
        <div key={c.label} className="glance-cell">
          <dt>
            <Icon d={c.d} />
            <span>{c.label}</span>
          </dt>
          <dd title={c.value}>{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}
