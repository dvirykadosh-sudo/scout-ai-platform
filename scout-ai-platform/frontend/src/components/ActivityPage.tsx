"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { Activity } from "@/lib/types";
import { ActivityActions } from "./ActivityActions";
import { DiscussionQuestions, ReviewPanel, SummaryBox } from "./ActivityInsights";
import { ActivityBody, ActivityMeta } from "./ActivityView";
import { FeedbackPanel } from "./FeedbackPanel";
import { TagsPanel } from "./CommunityParts";
import { SafetyPanel, SimilarActivities } from "./CareParts";
import { NewbieTips } from "./NewbieTips";
import { NotesSection } from "./NotesSection";
import { PrepChecklist } from "./PrepChecklist";
import { RatingBadge, Ratings } from "./Ratings";
import { RunsLog } from "./RunsLog";
import { isAdminUser, useAuth } from "./Providers";
import { Skeleton } from "./ui";

export function ActivityPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { token, user } = useAuth();
  const [a, setA] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [summary, setSummary] = useState<{ count: number; average: number } | null>(null);
  const onSummary = useCallback((s: { count: number; average: number }) => setSummary(s), []);

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

  const rating = summary ?? a.rating ?? { count: 0, average: 0 };

  return (
    <>
      <article className="card glass printable">
        <p className="no-print">
          <Link href="/library">חזרה למאגר</Link>
        </p>
        <h1>{a.title}</h1>
        <p className="print-only">{a.tribe}</p>
        <p>
          <RatingBadge average={rating.average} count={rating.count} />
        </p>
        <ActivityMeta a={a} />
        <ActivityBody a={a} />
        <ActivityActions activity={a} onChanged={load} onDeleted={() => router.push("/library")} />
      </article>
      {a.status === "PENDING" && (
        <p className="card warn-box no-print" role="status">
          הפעולה הזאת ממתינה לאישור של מנהל השבט, ולכן היא עוד לא מופיעה במאגר המשותף. הקישור הישיר עובד.
        </p>
      )}
      <PrepChecklist activity={a} />
      <SafetyPanel activityId={a.id} canManage={!!user && (isAdminUser(user) || (!a.isSeed && a.ownerId === user.id))} onChanged={load} />
      <NewbieTips activityId={a.id} />
      <DiscussionQuestions activityId={a.id} />
      <SummaryBox activityId={a.id} />
      <ReviewPanel activityId={a.id} />
      <SimilarActivities activityId={a.id} onMerged={() => router.push("/library")} />
      <TagsPanel activityId={a.id} />
      <RunsLog activityId={a.id} />
      {token && user && (isAdminUser(user) || (!a.isSeed && a.ownerId === user.id)) && <FeedbackPanel activityId={a.id} token={token} />}
      <NotesSection activityId={a.id} ownerId={a.ownerId} />
      <div className="card glass no-print">
        <Ratings activityId={a.id} onSummary={onSummary} />
      </div>
    </>
  );
}
