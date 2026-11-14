// שלב 66 (ממצאים 99–100): הדפסה בלי חלון קופץ. חלון חדש (window.open) נחסם בדפדפנים בנייד, ולכן ההדפסה
// נעשית ממסגרת נסתרת בתוך הדף. הקוד של המסגרת הוא HTML שנבנה אצלנו, וכל טקסט חופשי עובר escHtml.

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** מקודד טקסט לשימוש בתוך HTML, כולל גרש (') כדי שאפשר יהיה לשלב אותו גם בתוך מאפיין עם גרשיים בודדים. */
export const escHtml = (s: string): string => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]!);

/**
 * מדפיס מסמך HTML מלא. מחזיר false אם אי אפשר (למשל אין document), ואז הקורא מציג הודעה.
 * המסגרת מוסרת אחרי ההדפסה (או אחרי דקה, אם הדפדפן לא מדווח על סיום).
 */
export function printDocument(html: string): boolean {
  if (typeof document === "undefined") return false;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    frame.remove();
  };
  frame.onload = () => {
    const w = frame.contentWindow;
    if (!w) return cleanup();
    w.onafterprint = cleanup;
    try {
      w.focus();
      w.print();
    } catch {
      cleanup();
    }
    window.setTimeout(cleanup, 60_000);
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
  return true;
}
