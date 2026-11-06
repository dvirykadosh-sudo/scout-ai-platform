// תרשימים קטנים בכרטיסי ה-KPI. קישוטיים בלבד (aria-hidden): המספר עצמו מופיע בטקסט.
const W = 120;
const H = 44;

/** עמודות. העמודה האחרונה מודגשת (סימון "עכשיו") */
export function MiniBars({ values, highlight = values.length - 1 }: { values: number[]; highlight?: number }) {
  const max = Math.max(1, ...values);
  const bw = W / values.length;
  return (
    <svg className="db-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {values.map((v, i) => {
        const h = Math.max(3, (v / max) * (H - 4));
        return <rect key={i} className={i === highlight ? "bar now" : "bar"} x={i * bw + 3} y={H - h} width={bw - 6} height={h} rx={3} />;
      })}
    </svg>
  );
}

/** קו עם שטח מתחתיו */
export function MiniLine({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const step = W / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [i * step, H - 4 - (v / max) * (H - 10)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg className="db-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path className="area" d={`${line} L${W} ${H} L0 ${H} Z`} />
      <path className="line" d={line} />
    </svg>
  );
}
