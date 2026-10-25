import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" style={{ maxWidth: 560, margin: "15vh auto", padding: 16, textAlign: "center" }}>
      <h1>הדף לא נמצא</h1>
      <p>ייתכן שהקישור ישן או שנכתב בו משהו לא נכון.</p>
      <p>
        <Link className="btn btn-primary" href="/">
          חזרה לדף הבית
        </Link>
      </p>
    </main>
  );
}
