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
