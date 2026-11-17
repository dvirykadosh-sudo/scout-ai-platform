// שלב 68: נתב AI רב-שכבתי וחינמי. מנסה לפי סדר את הספקים שהוגדר להם מפתח ב-Environment:
//   GEMINI_API_KEY  (Google AI Studio, שכבה חינמית)    GROQ_API_KEY  (Llama 3.3 70B, שכבה חינמית)    ANTHROPIC_API_KEY (קיים, בתשלום)
// ואם אף ספק לא זמין, לא מוגבל או נכשל, הקוראים עוברים לגרסה המקומית שעובדת במאה אחוז בלי שום מפתח.
//
// עקרונות:
//  • מפתחות נשלחים רק בכותרות (לא בכתובת), ולא נרשמים בשום לוג. status() מחזיר שמות ומצבים בלבד.
//  • פרטיות: לפני כל שליחה החוצה מוסתרים מיילים, טלפונים ומספרי זהות. AI_EXTERNAL=0 סוגר את כל השליחה החוצה.
//  • שכבה חינמית של ספק יכולה להשתמש בתוכן ששולחים אליה לשיפור המוצר שלו. לכן קוראים לנתב רק עם שאלות כלליות ועם
//    טקסט שהמדריך כתב בעצמו, ולעולם לא עם שיחות חניכים (עוזר השיחות וסטודיו הסיפור נשארים כמו שהיו).
//  • מגבלות רכות לכל ספק (בקשות לדקה וליום) שנמוכות מהשכבה החינמית, ומנגנון הפסקה אחרי 429 או תקלה, כדי לא "להישרף".
//  • בדיקות: fetchImpl, now ו-limits ניתנים להחלפה.
import { requireAiBudget } from "./ai-budget.js";
import { config } from "./config.js";

export const PROVIDER_IDS = ["gemini", "groq", "anthropic"];

const DEFAULT_MODELS = {
  // רשימה מופרדת בפסיקים: אם הדגם הראשון לא קיים יותר (404), עוברים לבא אחריו. אפשר לדרוס ב-GEMINI_MODEL.
  gemini: "gemini-2.5-flash,gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile",
  anthropic: "claude-sonnet-5-5",
};
// מגבלות רכות (ברירת מחדל). השכבות החינמיות משתנות מעת לעת, ולכן אפשר לשנות ב-AI_LIMITS_JSON.
const DEFAULT_LIMITS = {
  gemini: { rpm: 8, rpd: 400 },
  groq: { rpm: 20, rpd: 700 },
  anthropic: { rpm: 40, rpd: Infinity }, // התקרה שלו היא AI_DAILY_CAP (ai-budget.js)
};

export class AiUnavailable extends Error {
  constructor(msg = "no AI provider available") {
    super(msg);
    this.name = "AiUnavailable";
    this.code = "NO_PROVIDER";
  }
}

/** מסתיר מיילים, טלפונים ומספרי זהות לפני שליחה לספק חיצוני */
export const redact = (s) =>
  String(s ?? "")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[מייל]")
    .replace(/(?:\+?972|0)[\s-]?(?:\d[\s-]?){8,9}/g, "[טלפון]")
    .replace(/(?<![\d-])\d{9}(?![\d-])/g, "[מספר]");

const splitModels = (m) =>
  String(m || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** @returns {{ready:()=>boolean, configured:()=>boolean, status:()=>any[], chat:(opts:any)=>Promise<{text:string,provider:string,model:string}>}} */
export function createAiRouter({ keys = {}, models = {}, order, fetchImpl = (...a) => globalThis.fetch(...a), now = Date.now, limits = {}, external = true } = {}) {
  const ids = (order && order.length ? order : PROVIDER_IDS).filter((id) => PROVIDER_IDS.includes(id));
  const st = {};
  // keys / models / external נקראים בכל קריאה (ולא נשמרים), כדי ששינוי הגדרה בזמן ריצה ובבדיקות יתקבל מיד
  const isOn = () => (typeof external === "function" ? !!external() : !!external);
  for (const id of PROVIDER_IDS) {
    st[id] = {
      get key() {
        return String(keys[id] || "");
      },
      get models() {
        return splitModels(models[id] || DEFAULT_MODELS[id]);
      },
      lim: { ...DEFAULT_LIMITS[id], ...(limits[id] || {}) },
      stamps: [],
      day: "",
      used: 0,
      until: 0,
      why: "",
      failures: 0,
    };
  }
  const dayKey = () => new Date(now()).toISOString().slice(0, 10);

  const usableNow = (id) => {
    const p = st[id];
    if (!isOn() || !p.key) return "off";
    const t = now();
    if (p.until > t) return p.why || "cooling";
    if (p.day !== dayKey()) {
      p.day = dayKey();
      p.used = 0;
    }
    if (p.used >= p.lim.rpd) return "daily-limit";
    p.stamps = p.stamps.filter((x) => t - x < 60_000);
    if (p.stamps.length >= p.lim.rpm) return "rate-limit";
    return "ready";
  };

  const cool = (id, ms, why) => {
    st[id].until = now() + ms;
    st[id].why = why;
  };

  async function callGemini(p, model, { system, user, json, maxTokens, temperature, timeoutMs, image }) {
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": p.key, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [...(image ? [{ inline_data: { mime_type: image.mime, data: image.data } }] : []), { text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature, ...(json ? { responseMimeType: "application/json" } : {}) },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { res, read: async () => (await res.json())?.candidates?.[0]?.content?.parts?.map((x) => x?.text || "").join("") };
  }
  async function callGroq(p, model, { system, user, json, maxTokens, temperature, timeoutMs }) {
    const res = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${p.key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: maxTokens,
        temperature,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { res, read: async () => (await res.json())?.choices?.[0]?.message?.content };
  }
  async function callAnthropic(p, model, { system, user, maxTokens, timeoutMs }) {
    // אותו מבנה בקשה בדיוק כמו שהיה לפני שלב 68, כדי שכל מי שכבר תלוי בו ימשיך לעבוד
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": p.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { res, read: async () => (await res.json())?.content?.[0]?.text };
  }
  const CALL = { gemini: callGemini, groq: callGroq, anthropic: callAnthropic };

  return {
    /** יש לפחות ספק אחד שמוגדר ופעיל כרגע (לא בהפסקה ולא מוגבל) */
    ready: () => ids.some((id) => usableNow(id) === "ready"),
    /** יש לפחות ספק אחד שמוגדר לו מפתח (גם אם כרגע בהפסקה) */
    configured: () => isOn() && ids.some((id) => !!st[id].key),
    status: () =>
      ids.map((id) => ({ id, configured: !!st[id].key, model: st[id].models[0] || "", state: usableNow(id), usedToday: st[id].day === dayKey() ? st[id].used : 0 })),

    /**
     * @param {{system:string,user:string,json?:boolean,maxTokens?:number,temperature?:number,timeoutMs?:number,only?:string[]}} o
     * מנסה את הספקים לפי הסדר. זורק AiUnavailable אם אף אחד לא ענה.
     */
    async chat(o) {
      const opt = { json: false, maxTokens: 450, temperature: 0.6, timeoutMs: 15_000, ...o, system: redact(o.system), user: redact(o.user) };
      let pool = o.only ? ids.filter((id) => o.only.includes(id)) : ids;
      // שלב 69: תמונה נשלחת רק ל-Gemini (Groq לא מקבל תמונות, ו-Anthropic בתשלום)
      if (o.image) pool = pool.filter((id) => id === "gemini");
      let lastErr = null;
      for (const id of pool) {
        if (usableNow(id) !== "ready") continue;
        const p = st[id];
        try {
          if (id === "anthropic") requireAiBudget();
        } catch (e) {
          lastErr = e;
          continue;
        }
        for (const model of p.models) {
          p.stamps.push(now());
          p.used++;
          try {
            const { res, read } = await CALL[id](p, model, opt);
            if (res.status === 404 && p.models.length > 1) continue; // דגם שלא קיים: הבא אחריו
            if (res.status === 429) {
              const ra = Number(res.headers?.get?.("retry-after"));
              cool(id, Math.min(Math.max(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 60_000, 5_000), 15 * 60_000), "rate-limit");
              lastErr = new Error(`${id} HTTP 429`);
              break;
            }
            if (res.status === 401 || res.status === 403) {
              cool(id, 10 * 60_000, "auth");
              lastErr = new Error(`${id} HTTP ${res.status}`);
              break;
            }
            if (!res.ok) {
              p.failures++;
              cool(id, res.status >= 500 ? 30_000 : 10_000, "cooling");
              lastErr = new Error(`${id} HTTP ${res.status}`);
              break;
            }
            const text = String((await read()) ?? "").trim();
            if (text.length < 2) {
              lastErr = new Error(`${id} empty`); // למשל חסימת בטיחות: עוברים לספק הבא, בלי הפסקה
              break;
            }
            p.failures = 0;
            return { text, provider: id, model };
          } catch (e) {
            p.failures++;
            cool(id, 30_000, "cooling");
            lastErr = e;
            break;
          }
        }
      }
      const err = new AiUnavailable(lastErr ? `no provider answered (${lastErr.message})` : "no AI provider available");
      throw err;
    },
  };
}

/** מחלץ JSON מתשובת מודל (גם כשהיא עטופה בטקסט או בגדרות קוד). מחזיר null אם אין. */
export function extractJson(text) {
  const raw = String(text ?? "");
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(raw.slice(a, b + 1));
  } catch {
    return null;
  }
}

let shared = null;
/** הנתב של האתר, נבנה לפי config פעם אחת. בבדיקות משתמשים ב-createAiRouter ישירות או ב-setSharedRouter. */
export function sharedRouter() {
  return (shared ||= routerFromConfig(config.ai));
}
export function routerFromConfig(ai = {}, extra = {}) {
  return createAiRouter({
    keys: {
      get gemini() {
        return ai.gemini?.key;
      },
      get groq() {
        return ai.groq?.key;
      },
      get anthropic() {
        return ai.key;
      },
    },
    models: {
      get gemini() {
        return ai.gemini?.model;
      },
      get groq() {
        return ai.groq?.model;
      },
      get anthropic() {
        return ai.model;
      },
    },
    order: ai.order,
    external: () => ai.external !== false,
    limits: ai.limits || {},
    ...extra,
  });
}
/** יש ספק AI זמין כרגע (Gemini, Groq או Anthropic). בלי אף אחד, היצירה נשארת במחולל התבניות המקומי. */
export const aiReady = () => sharedRouter().ready();
/** הוגדר לפחות מפתח אחד (גם אם כרגע בהפסקה): לתצוגות מצב והגדרות */
export const aiConfigured = () => sharedRouter().configured();
export const setSharedRouter = (r) => {
  shared = r;
};
