// שלב 59: דף ההתחברות (/account ו-/login) נפתח עם נשר כבוי וחוט משיכה.
// הפונקציה מדליקה את המנורה (אם היא כבויה), כדי שהטפסים יהיו זמינים לבדיקות.
export async function lampOn(page) {
  const pull = page.getByRole("button", { name: /חוט התאורה/ });
  if (await pull.count()) {
    const pressed = await pull.first().getAttribute("aria-pressed");
    if (pressed !== "true") await pull.first().click();
    await page.waitForTimeout(700);
  }
}
