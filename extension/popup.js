// עוזר שיחות: חלון התוסף. הכול מתחיל בלחיצה שלכם. אין קוד שרץ ברקע ואין קריאה לשיחות שלא פתחתם.
import { prepare, prepareText } from "./lib/mask.js";
import { getSelectionText, insertDraft, readChat } from "./lib/reader.js";

const $ = (id) => document.getElementById(id);
const store = { get: (k) => chrome.storage.local.get(k), set: (o) => chrome.storage.local.set(o) };
let cfg = { site: "", token: "", kid: "n", guide: "n", extra: "" };
let aliasMap = {};
let lastTabId = null;

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
  for (const c of kids.flat()) e.append(c instanceof Node ? c : String(c ?? ""));
  return e;
};
const setStatus = (t, err = false) => { const s = $("status"); s.textContent = t; s.className = err ? "hint err" : "hint"; };
const origin = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.origin : ""; } catch { return ""; } };
const unmask = (t) => Object.entries(aliasMap).reduce((s, [al, name]) => s.split(al).join(name), String(t ?? ""));

async function loadCfg() {
  cfg = { ...cfg, ...(await store.get(["site", "token", "kid", "guide", "extra"])) };
  $("site").value = cfg.site; $("token").value = cfg.token; $("extra").value = cfg.extra;
  for (const [name, v] of [["kid", cfg.kid], ["guide", cfg.guide]]) for (const r of document.querySelectorAll(`input[name="${name}"]`)) r.checked = r.value === v;
  if (!cfg.site || !cfg.token) { $("settings").hidden = false; $("btn-settings").setAttribute("aria-expanded", "true"); setStatus("כדי להתחיל, הדביקו את כתובת האתר ואת האסימון."); }
}

async function call(path, body) {
  const base = origin(cfg.site);
  if (!base) throw new Error("כתובת האתר לא תקינה.");
  if (!(await chrome.permissions.contains({ origins: [`${base}/*`] }))) throw new Error("אין הרשאה לאתר. פתחו הגדרות ולחצו שמירה.");
  let r;
  try { r = await fetch(base + path, { method: body ? "POST" : "GET", headers: { "X-Maoz-Ext": cfg.token, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }); } catch { throw new Error("לא הצלחנו להגיע לאתר. אם הוא ישן (Render חינמי), נסו שוב בעוד דקה."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `שגיאה ${r.status}`);
  return j;
}

async function saveSettings() {
  const base = origin($("site").value.trim());
  const token = $("token").value.trim();
  if (!base) return setStatus("כתובת האתר לא תקינה. היא צריכה להתחיל ב-https://", true);
  if (!/^mx_[a-f0-9]{48}$/.test(token)) return setStatus("האסימון לא נראה תקין. הוא מתחיל ב-mx_ ויוצר באתר.", true);
  const granted = await chrome.permissions.request({ origins: [`${base}/*`] });
  if (!granted) return setStatus("בלי הרשאה לאתר התוסף לא יכול לעבוד.", true);
  cfg = { site: base, token, kid: document.querySelector('input[name="kid"]:checked').value, guide: document.querySelector('input[name="guide"]:checked').value, extra: $("extra").value.slice(0, 200) };
  await store.set(cfg);
  try { const p = await call("/api/chat/ping"); setStatus(`מחובר כ-${p.username}.`); $("settings").hidden = true; $("btn-settings").setAttribute("aria-expanded", "false"); } catch (e) { setStatus(e.message, true); }
}

const extraNames = () => cfg.extra.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 12);

async function analyze(prep) {
  aliasMap = prep.aliasMap;
  setStatus("מנתח...");
  try {
    const a = await call("/api/chat/analyze", { messages: prep.messages, masked: true, me: "אני", kid: cfg.kid, guide: cfg.guide, mode: "auto" });
    setStatus("");
    render(a);
  } catch (e) { setStatus(e.message, true); }
}

async function onChat() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/web\.whatsapp\.com\//.test(tab.url || "")) return setStatus("פתחו את וואטסאפ ווב בלשונית הנוכחית, היכנסו לשיחה, ונסו שוב.", true);
  lastTabId = tab.id;
  let rows;
  try { [{ result: rows }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readChat, args: [400] }); } catch { return setStatus("לא הצלחנו לקרוא את הדף. רעננו את וואטסאפ ווב ונסו שוב.", true); }
  if (!rows?.length) return setStatus("לא מצאנו הודעות על המסך. וואטסאפ אולי שינתה את מבנה הדף. סמנו הודעה בדף ונתחו אותה בתיבה למטה.", true);
  await analyze(prepare(rows, { extra: extraNames() }));
}

async function onText() {
  let text = $("paste").value.trim();
  if (!text) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) { try { [{ result: text }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: getSelectionText }); lastTabId = /^https:\/\/web\.whatsapp\.com\//.test(tab.url || "") ? tab.id : null; } catch { /* דפים מוגנים */ } }
    text = (text || "").trim();
    if (text) $("paste").value = text;
  }
  if (!text) return setStatus("סמנו הודעה בדף, או הדביקו אותה בתיבה.", true);
  await analyze(prepareText(text, { extra: extraNames() }));
}

function variantBox(text, canInsert) {
  const ta = el("textarea", { rows: "3", dir: "auto", "aria-label": "טיוטה לעריכה" });
  ta.value = text;
  const copy = el("button", { type: "button", onclick: async () => { try { await navigator.clipboard.writeText(unmask(ta.value)); copy.textContent = "הועתק"; } catch { setStatus("ההעתקה נחסמה.", true); } } }, "העתקה");
  const kids = [ta, copy];
  if (canInsert) kids.push(el("button", { type: "button", onclick: async () => {
    try { const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: lastTabId }, func: insertDraft, args: [unmask(ta.value)] }); setStatus(result ? "הטיוטה הוכנסה לתיבת הכתיבה. קראו ושלחו בעצמכם." : "לא מצאנו את תיבת הכתיבה. השתמשו בהעתקה.", !result); } catch { setStatus("לא הצלחנו להכניס. השתמשו בהעתקה.", true); }
  } }, "הכנסה לתיבת הכתיבה"));
  return el("div", { class: "variant" }, ...kids);
}

function render(a) {
  const out = $("out");
  out.replaceChildren();
  const canInsert = lastTabId !== null;
  const s = a.safety;
  if (s.level !== "none" && s.advice) {
    out.append(el("div", { class: `box ${s.level}`, role: s.level === "urgent" ? "alert" : "region" },
      el("h2", {}, (s.level === "urgent" ? "🛑 " : "⚠️ ") + s.advice.title),
      el("ul", {}, s.advice.do.slice(0, 5).map((x) => el("li", {}, x))),
      el("p", {}, "קווי סיוע: ", s.hotlines.map((h) => `${h.name} ${h.number}`).join(" · ")),
      el("p", { class: "hint" }, "פעלו לפי נוהל ההגנה על ילדים של התנועה. הפרטים המלאים באתר.")));
  }
  out.append(el("p", { class: "hint" }, `${a.mode === "group" ? "שיחת קבוצה" : "שיחה עם חניך"}: ${a.counts.messages} הודעות.`));
  if (a.plan?.length) out.append(el("div", { class: "box" }, el("h2", {}, "מה כדאי לעשות"), el("ol", {}, a.plan.slice(0, 5).map((p) => el("li", {}, unmask(p.text))))));
  if (a.pending) {
    const lab = a.intentLabels[a.pending.intent.primary] || "";
    out.append(el("div", { class: "box" }, el("h2", {}, "מה מחכה לתשובה"), el("blockquote", { dir: "auto" }, unmask(a.pending.text)), el("p", { class: "hint" }, `כוונה: ${lab}.${a.pending.tone.top.length ? ` מצב רוח אפשרי: ${a.pending.tone.top.map((t) => t.label).join(", ")} (אמינות ${a.pending.tone.confidence}).` : ""}`)));
  }
  const r = a.replies;
  if (r?.suppressed) out.append(el("div", { class: "box" }, el("h2", {}, "תגובות בטוחות"), (r.safe || []).map((t) => variantBox(t, canInsert))));
  else if (r?.variants?.length) out.append(el("div", { class: "box" }, el("h2", {}, "תגובות מוצעות"), el("p", { class: "hint" }, "טיוטות לעריכה. שום דבר לא נשלח."), r.variants.map((v) => variantBox(v.text, canInsert)), r.tip ? el("p", { class: "hint" }, r.tip) : ""));
  if (a.fading?.length) out.append(el("div", { class: "box" }, el("h2", {}, "מי מתרחק"), el("ul", {}, a.fading.map((f) => el("li", {}, `${unmask(f.who)}: ${f.kind === "silent" ? "שותק/ת שבועיים" : "ירידה בפעילות"}`)))));
  out.append(el("p", { class: "hint" }, "זה כלי עזר, לא תחליף לשיקול דעת. הוא לא תופס הכול."));
}

$("btn-settings").addEventListener("click", () => { const h = $("settings").hidden; $("settings").hidden = !h; $("btn-settings").setAttribute("aria-expanded", String(h)); });
$("btn-save").addEventListener("click", saveSettings);
$("btn-chat").addEventListener("click", onChat);
$("btn-text").addEventListener("click", onText);
loadCfg();
