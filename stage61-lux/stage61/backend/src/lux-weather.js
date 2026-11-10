// שלב 61: מזג אוויר למקום המפגש. פונקציות טהורות (נבדקות בלי רשת) + מטמון קטן.
// המקור: Open-Meteo (בלי מפתח). הדפדפן לא פונה אליו ישירות, כי ה-CSP של האתר מגביל חיבורים ל-self.

/** קוד מזג אוויר של WMO לסוג פשוט. */
export function kindOf(code) {
  if (code == null) return "unknown";
  if (code >= 95) return "storm";
  if (code >= 71 && code <= 77) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code === 45 || code === 48) return "fog";
  if (code === 0 || code === 1) return "clear";
  return "cloud";
}

export const KIND_LABEL = { storm: "סופת רעמים", snow: "שלג", rain: "גשם", fog: "ערפל", clear: "בהיר", cloud: "מעונן חלקית", unknown: "לא ידוע" };

/**
 * המלצה לפעולה לפי תנאי מזג האוויר. זו הצעה בלבד: ההחלטה תמיד של המדריך.
 * @returns {{ level: "ok"|"warn"|"danger", adapt: "rain"|"heat"|"cold"|"storm"|null, text: string, tips: string[] }}
 */
export function adviceFor({ tempC, popPct, precipMm, code }) {
  const kind = kindOf(code);
  if (kind === "storm") {
    return { level: "danger", adapt: "storm", text: "צפויה סופת רעמים. לא נשארים בשטח פתוח, מעבירים את הפעולה למבנה.", tips: ["לוודא שיש מבנה סגור במקום", "להכין פעולת ישיבה במקום פעולת שטח", "להיערך מראש בהודעה להורים"] };
  }
  if (kind === "rain" || kind === "snow" || (popPct != null && popPct >= 60) || (precipMm != null && precipMm >= 1)) {
    return { level: "warn", adapt: "rain", text: "צפוי גשם. כדאי להכין חלופה במבנה, או פעולה קצרה בחוץ עם ציוד גשם.", tips: ["חלופה בתוך המבנה (משחק ישיבה, דיון, יצירה)", "אם יוצאים החוצה: מעילי גשם ושקיות לציוד", "להודיע להורים על לבוש מתאים"] };
  }
  if (tempC != null && tempC >= 32) {
    return { level: "warn", adapt: "heat", text: "חם מאוד. עדיף פעולה רגועה בצל, ומים בלי הגבלה.", tips: ["מים קרים לכל משתתף", "צל או מבנה מקורר, כובעים", "פעילות תנועתית רק בשעות הנוחות יותר"] };
  }
  if (tempC != null && tempC >= 28) {
    return { level: "ok", adapt: "heat", text: "חם. כדאי להכין מים וצל, ולהימנע מריצה ארוכה.", tips: ["בקבוקי מים", "מקום מוצל להתכנסות"] };
  }
  if (tempC != null && tempC <= 10) {
    return { level: "warn", adapt: "cold", text: "קר. שכבות לבוש, ופעולה תנועתית שמחממת.", tips: ["לבקש שכבות לבוש מראש", "פתיחה תנועתית שמחממת את הקבוצה"] };
  }
  return { level: "ok", adapt: null, text: "מזג האוויר נוח לפעולה בחוץ.", tips: [] };
}

/** בוחר מתוך תחזית Open-Meteo את השעה הקרובה לאירוע. date=YYYY-MM-DD, hour=0..23 */
export function pickHour(forecast, date, hour) {
  const h = forecast?.hourly;
  if (!h || !Array.isArray(h.time)) return null;
  const want = `${date}T${String(hour).padStart(2, "0")}:00`;
  let i = h.time.indexOf(want);
  if (i < 0) return null;
  const num = (arr) => (Array.isArray(arr) && typeof arr[i] === "number" ? arr[i] : null);
  return { tempC: num(h.temperature_2m), popPct: num(h.precipitation_probability), precipMm: num(h.precipitation), code: num(h.weather_code) };
}

/** מטמון בזיכרון עם תפוגה. */
export function ttlCache(max = 200) {
  const m = new Map();
  return {
    get(k) {
      const e = m.get(k);
      if (!e) return undefined;
      if (e.exp < Date.now()) {
        m.delete(k);
        return undefined;
      }
      return e.v;
    },
    set(k, v, ttlMs) {
      if (m.size >= max) m.delete(m.keys().next().value);
      m.set(k, { v, exp: Date.now() + ttlMs });
    },
  };
}

const GEO = "https://geocoding-api.open-meteo.com/v1/search";
const FC = "https://api.open-meteo.com/v1/forecast";

/** מחפש מקום לפי שם ומחזיר {name, lat, lon} או null. */
export async function geocode(place, fetchImpl = fetch) {
  const u = `${GEO}?name=${encodeURIComponent(place)}&count=1&language=he&format=json`;
  const r = await fetchImpl(u, { signal: AbortSignal.timeout(6000), headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`geocode ${r.status}`);
  const j = await r.json();
  const p = j?.results?.[0];
  if (!p || typeof p.latitude !== "number" || typeof p.longitude !== "number") return null;
  return { name: [p.name, p.admin1].filter(Boolean).join(", "), lat: p.latitude, lon: p.longitude };
}

export async function forecast(lat, lon, fetchImpl = fetch) {
  const u = `${FC}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&timezone=auto&forecast_days=7`;
  const r = await fetchImpl(u, { signal: AbortSignal.timeout(7000), headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`forecast ${r.status}`);
  return r.json();
}
