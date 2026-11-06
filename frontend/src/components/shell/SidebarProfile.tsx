"use client";

// כרטיס הפרופיל בראש הסרגל: אות ראשונה, שם ותפקיד. אורח מקבל קישור לכניסה.
import Link from "next/link";
import { isAdminUser, useAuth } from "../Providers";

const STAFF: Record<string, string> = { SUPER: "מנהל ראשי", CONTENT: "מנהל תוכן", USERS: "מנהל משתמשים", VIEWER: "צופה" };

export function SidebarProfile() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="sh-profile" aria-hidden="true" />;
  if (!user) {
    return (
      <Link href="/login" prefetch={false} className="sh-profile">
        <span className="sh-avatar" aria-hidden="true">?</span>
        <span className="sh-who">
          <strong>אורח</strong>
          <span>כניסה לחשבון</span>
        </span>
      </Link>
    );
  }
  const role = isAdminUser(user) ? STAFF[user.staffRole ?? "SUPER"] ?? "מנהל" : "מדריך/ה";
  return (
    <Link href="/account" prefetch={false} className="sh-profile" aria-label={`${user.displayName}, ${role}. לאזור האישי`}>
      <span className="sh-avatar" aria-hidden="true">{(user.displayName || user.username).trim().charAt(0)}</span>
      <span className="sh-who">
        <strong>{user.displayName}</strong>
        <span>{role}</span>
      </span>
    </Link>
  );
}
