import type { Metadata, Viewport } from "next";
import "./globals.css";
import "../styles/tailwind.css";
import "../styles/tokens.css";
import "../styles/shell.css";
import "../styles/dashboard.css";
import "../styles/wa.css";
import "../styles/login.css";
import "../styles/design.css";
import { Providers } from "@/components/Providers";
import { PwaSupport } from "@/components/PwaSupport";
import { Shortcuts } from "@/components/Shortcuts";
import { INDEXING, siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

const DESC = "מחולל פעולות חכם למדריכי שבט מעוז: יצירת פעולות בחמישה שלבים, מאגר פעולות, מצב הדרכה בשטח וייצוא ל-Word.";
const BING = process.env.BING_SITE_VERIFICATION;
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "מחולל פעולות | שבט מעוז", template: "%s | מחולל פעולות" },
  manifest: "/manifest.webmanifest",
  description: DESC,
  applicationName: "מחולל פעולות",
  alternates: { canonical: "./" },
  robots: INDEXING ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" } } : { index: false, follow: false },
  openGraph: { type: "website", locale: "he_IL", siteName: "מחולל פעולות | שבט מעוז", description: DESC, images: [{ url: "/logo-maoz.png", width: 512, height: 512, alt: "לוגו שבט מעוז" }] },
  twitter: { card: "summary", description: DESC },
  verification: { ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}), ...(BING ? { other: { "msvalidate.01": BING } } : {}) },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0B0D12" };

// Applies saved accessibility settings before first paint, so there is no flash.
const initScript = `try{var d=document.documentElement;if(localStorage.getItem('scout.hc')==='1'||(localStorage.getItem('scout.hc')===null&&window.matchMedia('(prefers-contrast: more)').matches))d.classList.add('hc');if(localStorage.getItem('scout.comfy')==='1')d.classList.add('comfy');var sv=localStorage.getItem('scout.saver');if(sv==='1'||(sv===null&&navigator.connection&&navigator.connection.saveData))d.classList.add('saver');if(localStorage.getItem('scout.large')==='1')d.classList.add('large');if(localStorage.getItem('scout.compact')==='1')d.classList.add('compact');if(localStorage.getItem('scout.panel')==='dark')d.dataset.panel='dark';var pl=localStorage.getItem('scout.palette');if(pl==='blue'||pl==='green'||pl==='fire')d.dataset.palette=pl;var t=localStorage.getItem('scout.theme');if(t==='light'||(t!=='dark'&&window.matchMedia('(prefers-color-scheme: light)').matches))d.classList.add('light')}catch(e){}`;

const SITE_LD = () => {
  const base = siteUrl();
  return [
    { "@context": "https://schema.org", "@type": "Organization", name: "שבט מעוז", alternateName: "מחולל פעולות", url: base, logo: `${base}/logo-maoz.png`, areaServed: "ראשון לציון" },
    { "@context": "https://schema.org", "@type": "WebSite", name: "מחולל פעולות | שבט מעוז", url: base, inLanguage: "he", potentialAction: { "@type": "SearchAction", target: `${base}/library?q={search_term_string}`, "query-input": "required name=search_term_string" } },
  ];
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
        {INDEXING && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_LD()).replace(/</g, "\\u003c") }} />}
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
