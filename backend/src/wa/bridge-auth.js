// שלב 58 – אסימוני גשר. האסימון מוצג פעם אחת בלבד, במסד נשמר רק hash (SHA-256), וניתן לבטל בכל רגע.
import crypto from "node:crypto";
import { activeBridgeCount, findBridgeByHash, insertBridge, revokeBridge, touchBridge } from "./repo.js";

export const MAX_BRIDGES = 3;
const FORMAT = /^wb_[0-9a-f]{48}$/;
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

/** יוצר גשר חדש. מחזיר את האסימון המלא (פעם אחת) או { error } אם יש כבר יותר מדי. */
export function createBridge(db, { name, by }) {
  if (activeBridgeCount(db) >= MAX_BRIDGES) return { error: `אפשר עד ${MAX_BRIDGES} גשרים פעילים. בטלו אחד קודם.` };
  const token = `wb_${crypto.randomBytes(24).toString("hex")}`;
  const id = insertBridge(db, { name, tokenHash: sha(token), by });
  return { id, token };
}

/** בודק אסימון שהגיע בכותרת. מחזיר את שורת הגשר או null. */
export function verifyBridge(db, token) {
  if (typeof token !== "string" || !FORMAT.test(token)) return null;
  return findBridgeByHash(db, sha(token));
}

export { revokeBridge, touchBridge };
