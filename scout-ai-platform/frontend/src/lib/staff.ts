// תפקידי צוות: אותן הרשאות כמו בשרת (backend/src/accounts.js), כדי להציג רק מה שמותר.
export type Staff = "SUPER" | "CONTENT" | "USERS" | "VIEWER";
export const STAFF_LABEL: Record<Staff, string> = { SUPER: "אדמין ראשי", CONTENT: "מנהל תוכן", USERS: "מנהל משתמשים", VIEWER: "צופה בלבד" };
export type Section = "stats" | "content" | "contentEdit" | "users" | "audit" | "backups" | "visitors";
export function canSee(staff: Staff | null | undefined, section: Section): boolean {
  const s = staff ?? "SUPER";
  if (s === "SUPER") return true;
  if (s === "CONTENT") return section === "stats" || section === "content" || section === "contentEdit";
  if (s === "VIEWER") return section === "stats" || section === "content";
  if (s === "USERS") return section === "stats" || section === "users" || section === "audit" || section === "visitors";
  return false;
}

/** תפקיד אפקטיבי של אדמין: בלי תפקיד מוגדר נחשב אדמין ראשי. */
export const effectiveStaffOf = (s: Staff | null | undefined): Staff => s ?? "SUPER";
