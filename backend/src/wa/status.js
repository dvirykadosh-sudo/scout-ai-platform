// שלב 58 – מצב החיבור החי של הגשר. נשמר בזיכרון בלבד: ה-QR הוא סוד (מי שסורק אותו מחבר את חשבון הוואטסאפ),
// ולכן הוא לא נכתב למסד, ליומן או לקובץ, ונעלם אחרי שהחיבור הצליח או אחרי זמן קצר.

const STALE_MS = 45_000; // בלי פעימת חיים כל כך הרבה זמן = הגשר לא מחובר
const QR_TTL_MS = 90_000;
const STATES = new Set(["starting", "qr", "connected", "disconnected", "reconnecting", "conflict"]);

let live = { bridgeId: null, state: "offline", qr: null, qrAt: 0, account: null, version: null, seenAt: 0 };
let groups = { at: 0, items: [] };

/** מקבל פעימת חיים מהגשר. מחזיר את המצב שנשמר. */
export function reportState(bridgeId, { state, qr, account, version }, now = Date.now()) {
  const st = STATES.has(state) ? state : "disconnected";
  const hasQr = st === "qr" && typeof qr === "string" && qr.length > 10 && qr.length <= 90_000;
  live = {
    bridgeId,
    state: st,
    qr: hasQr ? qr : null,
    qrAt: hasQr ? now : 0,
    account: st === "connected" && account ? { hint: String(account.hint || "").slice(0, 12), name: String(account.name || "").slice(0, 40) } : null,
    version: version ? String(version).slice(0, 20) : null,
    seenAt: now,
  };
  return live;
}

/** המצב כפי שמוצג לאדמין. כולל את ה-QR רק כשהוא טרי. */
export function liveStatus(now = Date.now()) {
  const stale = !live.seenAt || now - live.seenAt > STALE_MS;
  const state = stale ? "offline" : live.state;
  const qrFresh = state === "qr" && live.qr && now - live.qrAt <= QR_TTL_MS;
  return { state, bridgeId: live.bridgeId, qr: qrFresh ? live.qr : null, account: state === "connected" ? live.account : null, version: live.version, lastSeenMs: live.seenAt ? now - live.seenAt : null };
}

export const bridgeIsUp = (now = Date.now()) => liveStatus(now).state === "connected";

/** רשימת הקבוצות שהגשר מדווח עליהן (לייבוא כאנשי קשר). */
export function reportGroups(items, now = Date.now()) {
  groups = { at: now, items: items.slice(0, 300).map((g) => ({ id: String(g.id).slice(0, 60), name: String(g.name || "").slice(0, 80), size: Number(g.size) || 0 })) };
}
export const knownGroups = () => groups;

/** לבדיקות בלבד. */
export function resetStatus() {
  live = { bridgeId: null, state: "offline", qr: null, qrAt: 0, account: null, version: null, seenAt: 0 };
  groups = { at: 0, items: [] };
}
