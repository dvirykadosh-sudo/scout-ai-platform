// שלב 61 (רעיון 7): שלד טעינה בצורת הפעולה האמיתית: כותרת, תגיות וחמישה כרטיסי שלבים שמופיעים בזה אחר זה.
export function ActivitySkeleton({ stages = 5, label = "טוען את הפעולה" }: { stages?: number; label?: string }) {
  return (
    <div className="card glass lux-skel" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="lux-sk lux-sk-title" />
      <div className="lux-sk-chips" aria-hidden="true">
        {[64, 88, 72, 96].map((w, i) => (
          <span key={i} className="lux-sk lux-sk-chip" style={{ width: w }} />
        ))}
      </div>
      <div className="lux-sk-stages" aria-hidden="true">
        {Array.from({ length: stages }, (_, i) => (
          <div key={i} className="lux-sk-stage" style={{ ["--i" as string]: i }}>
            <span className="lux-sk lux-sk-num" />
            <div className="lux-sk-lines">
              <span className="lux-sk" style={{ width: `${46 + ((i * 11) % 22)}%` }} />
              <span className="lux-sk" style={{ width: `${86 - ((i * 7) % 18)}%` }} />
              <span className="lux-sk" style={{ width: `${62 + ((i * 5) % 20)}%` }} />
            </div>
            <span className="lux-sk lux-sk-min" />
          </div>
        ))}
      </div>
    </div>
  );
}
