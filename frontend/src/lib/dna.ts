// שלב 70: "ה-DNA של הקבוצה": סוגים ובחירת המדריך (שמורה במכשיר בלבד). הפרופיל עצמו מחושב בשרת מהיומן הפרטי.
export interface Scored {
  name: string;
  n: number;
  avg: number;
}
export interface Theme {
  id: string;
  label: string;
  n: number;
}
export interface GroupDna {
  ready: boolean;
  runs: number;
  rated: number;
  confidence: "low" | "medium" | "high";
  energy: { pref: "high" | "calm" | "mixed" | null; highN: number; calmN: number; highAvg: number; calmAvg: number };
  winMethods: Scored[];
  weakMethods: Scored[];
  timing: "long" | "short" | "ok" | null;
  winThemes: Theme[];
  failThemes: Theme[];
  values: Scored[];
  hint: string;
  kids: { count: number; avg: number; wantMore: number } | null;
}
export interface DnaResponse {
  groups: { label: string; runs: number; rated: number }[];
  group: string;
  dna: GroupDna;
}

const KEY = "maoz.dna";
export const DNA_EVENT = "maoz-dna";

/** "" = כבוי, "*" = כל ההפעלות (ברירת המחדל: מכוון אוטומטית כשיש מספיק נתונים), אחרת תווית קבוצה */
export function getDnaChoice(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "off") return "";
    return v || "*";
  } catch {
    return "*";
  }
}
export function setDnaChoice(v: string): void {
  try {
    localStorage.setItem(KEY, v === "" ? "off" : v);
  } catch {}
  window.dispatchEvent(new Event(DNA_EVENT));
}
/** שדה לצירוף לבקשות למעוז, לסימולטור ולטיוטה */
export function dnaBody(): { dna?: string } {
  const c = getDnaChoice();
  return c ? { dna: c } : {};
}
