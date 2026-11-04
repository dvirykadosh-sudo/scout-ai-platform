// מצב הדרכה בשטח: מסך מלא, בלי כותרת ובלי ניווט האתר.
export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return <main id="main" tabIndex={-1} className="field-root">{children}</main>;
}
