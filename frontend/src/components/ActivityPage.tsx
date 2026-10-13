"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { Activity } from "@/lib/types";
import { ActivityActions } from "./ActivityActions";
import { ActivityBody, ActivityMeta } from "./ActivityView";
import { Skeleton } from "./ui";

export function ActivityPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [a, setA] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    api<Activity>(`/api/activities/${id}`)
      .then((d) => {
        setA(d);
        setError("");
        setNotFound(false);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(errorMessage(e));
      });
  }, [id]);

  useEffect(load, [load]);

  if (notFound)
    return (
      <div className="card empty">
        <h1>הפעולה לא נמצאה</h1>
        <p>ייתכן שהיא נמחקה.</p>
        <Link className="btn btn-primary" href="/library">
          חזרה למאגר
        </Link>
      </div>
    );
  if (error)
    return (
      <div className="error-box" role="alert">
        <p>{error}</p>
        <button type="button" className="btn" onClick={load}>
          ניסיון חוזר
        </button>
      </div>
    );
  if (!a) return <Skeleton lines={6} />;

  return (
    <article className="card glass">
      <p>
        <Link href="/library">חזרה למאגר</Link>
      </p>
      <h1>{a.title}</h1>
      <ActivityMeta a={a} />
      <ActivityBody a={a} />
      <ActivityActions activity={a} onChanged={load} onDeleted={() => router.push("/library")} />
    </article>
  );
}
