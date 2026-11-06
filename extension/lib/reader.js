// פונקציות שרצות בתוך הדף של וואטסאפ ווב (נשלחות דרך chrome.scripting). כל אחת עומדת בפני עצמה, בלי תלות בקבצים אחרים.
// הסלקטורים כאן הם הנקודה היחידה שתיפגע אם וואטסאפ תשנה את הדף: data-pre-plain-text, data-id, .selectable-text.

/** קורא את ההודעות שמוצגות עכשיו על המסך בשיחה הפתוחה. לא לוחץ, לא גולל ולא משנה כלום. */
export function readChat(maxMessages = 400) {
  const flat = (node) => {
    let s = "";
    for (const c of node.childNodes) {
      if (c.nodeType === 3) s += c.textContent;
      else if (c.nodeName === "BR") s += "\n";
      else if (c.nodeName === "IMG") s += c.getAttribute("alt") || "";
      else if (c.nodeType === 1) s += flat(c);
    }
    return s;
  };
  const re = /^\[(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp]\.?[Mm]\.?)?,\s*(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\]\s*(.*?):\s*$/;
  const rows = [];
  for (const el of document.querySelectorAll("[data-pre-plain-text]")) {
    const meta = (el.getAttribute("data-pre-plain-text") || "").replace(/[‎‏‪-‮]/g, "").trim();
    const m = re.exec(meta);
    if (!m) continue;
    const text = flat(el.querySelector(".selectable-text") || el).replace(/ /g, " ").trim();
    if (!text) continue;
    const row = el.closest("[data-id]");
    const mine = (row && /^true_/.test(row.getAttribute("data-id") || "")) || !!el.closest(".message-out");
    rows.push({ who: m[7].trim() || "?", mine: !!mine, h: +m[1], mi: +m[2], ap: m[3] || "", a: +m[4], b: +m[5], y: +m[6], text });
  }
  return rows.slice(-maxMessages);
}

/** הטקסט שהמשתמש סימן בדף. */
export function getSelectionText() {
  return String((window.getSelection && window.getSelection().toString()) || "").slice(0, 4000);
}

/** שם טיוטה בתיבת הכתיבה של וואטסאפ בלי לשלוח. מוסיף בסוף מה שכבר כתוב. */
export function insertDraft(text) {
  const box = document.querySelector('footer [contenteditable="true"]') || document.querySelector('[contenteditable="true"][data-tab]');
  if (!box) return false;
  box.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(box);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  const lines = String(text).split("\n");
  let ok = true;
  lines.forEach((ln, i) => {
    if (i) document.execCommand("insertLineBreak");
    ok = document.execCommand("insertText", false, ln) && ok;
  });
  return !!ok;
}
