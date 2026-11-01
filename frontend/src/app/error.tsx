"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/Monitor54";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { reportClientError(error.message || "render error", error.stack); }, [error]);
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
