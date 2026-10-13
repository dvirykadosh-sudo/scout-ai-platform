import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: { default: "מחולל פעולות | שבט מעוז", template: "%s | מחולל פעולות" },
  description: "מחולל פעולות חכם למדריכי שבט מעוז: יצירת פעולות בחמישה שלבים, מאגר פעולות, מצב הדרכה בשטח וייצוא ל-Word.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#130E26" };

// Applies saved accessibility settings before first paint, so there is no flash.
const initScript = `try{var d=document.documentElement;if(localStorage.getItem('scout.hc')==='1')d.classList.add('hc');if(localStorage.getItem('scout.large')==='1')d.classList.add('large')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
