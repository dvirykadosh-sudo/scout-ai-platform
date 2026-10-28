import { DepthLayers } from "@/components/Depth3D";
import { BottomNav, Effects, Splash } from "@/components/Polish";
import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { ServerWake } from "@/components/WriteFinal";
import { CommandPalette, StatusBanners } from "@/components/SystemParts";

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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="print-wm" src="/logo-maoz.png" alt="" aria-hidden="true" />
            <a className="skip-link" href="#main">
              דלג לתוכן הראשי
            </a>
            <Effects />
            <DepthLayers />
            <SiteHeader />
            <ServerWake />
            <StatusBanners />
            <CommandPalette />
            <main id="main" tabIndex={-1} className="page">
              {children}
            </main>
            <SiteFooter />
            <BottomNav />
            <Splash />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
