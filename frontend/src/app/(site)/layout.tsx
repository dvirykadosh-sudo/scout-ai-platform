import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { ServerWake } from "@/components/WriteFinal";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    // טבלת פריסה: בהדפסה ה-thead (הלוגו הקבוע) חוזר בראש כל עמוד. במסך כל האלמנטים הם בלוקים רגילים.
    <table className="print-shell" role="presentation">
      <thead className="print-brand" aria-hidden="true">
        <tr>
          <td>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-maoz.png" alt="" width={64} height={64} />
            <span>שבט מעוז · מחולל פעולות</span>
          </td>
        </tr>
      </thead>
      <tbody className="print-body">
        <tr>
          <td>
            <a className="skip-link" href="#main">
              דלג לתוכן הראשי
            </a>
            <SiteHeader />
            <ServerWake />
            <main id="main" tabIndex={-1} className="page">
              {children}
            </main>
            <SiteFooter />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
