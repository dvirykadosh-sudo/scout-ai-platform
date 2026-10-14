import { SiteFooter, SiteHeader } from "@/components/Chrome";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        דלג לתוכן הראשי
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="page">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
