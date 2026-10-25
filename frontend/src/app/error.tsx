"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" style={{ maxWidth: 560, margin: "15vh auto", padding: 16, textAlign: "center" }}>
      <h1>משהו השתבש</h1>
      <p>זה לא קרה בגללכם. אפשר לנסות שוב, ואם זה חוזר, לרענן את העמוד.</p>
      <p>
        <button className="btn btn-primary" onClick={reset}>
          ניסיון נוסף
        </button>{" "}
        <a className="btn" href="/">
          לדף הבית
        </a>
      </p>
    </main>
  );
}
