// עמודים מסך-מלא בלי כותרת וכותרת תחתונה של האתר (מסך הכניסה). ה-Providers מגיעים מהמעטפת הראשית.
export default function BareLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" tabIndex={-1}>
      {children}
    </main>
  );
}
