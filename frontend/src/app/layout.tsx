import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { PwaSupport } from "@/components/PwaSupport";
import { Shortcuts } from "@/components/Shortcuts";

export const metadata: Metadata = {
  title: { default: "מחולל פעולות | שבט מעוז", template: "%s | מחולל פעולות" },
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  description: "מחולל פעולות חכם למדריכי שבט מעוז: יצירת פעולות בחמישה שלבים, מאגר פעולות, מצב הדרכה בשטח וייצוא ל-Word.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#130E26" };

// Applies saved accessibility settings before first paint, so there is no flash.
const initScript = `try{var d=document.documentElement;if(localStorage.getItem('scout.hc')==='1')d.classList.add('hc');if(localStorage.getItem('scout.large')==='1')d.classList.add('large');if(localStorage.getItem('scout.compact')==='1')d.classList.add('compact');var pl=localStorage.getItem('scout.palette');if(pl==='blue'||pl==='green')d.dataset.palette=pl;var t=localStorage.getItem('scout.theme');if(t==='light'||(t!=='dark'&&window.matchMedia('(prefers-color-scheme: light)').matches))d.classList.add('light')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
      </head>
      <body>
        <Providers>
          <PwaSupport />
          <Shortcuts />
          {children}
        </Providers>
      </body>
    </html>
  );
}
