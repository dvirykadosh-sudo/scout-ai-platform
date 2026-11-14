// שלב 66 (ממצא 84): מפת ה-API נוצרת מהנתיבים שרשומים בפועל בשרת, כך שהיא לא מתיישנת.
// הרצה מהשורש: npm run docs:api   (כותב את docs/openapi.json)
// זה מיפוי של נתיבים, שיטות ופרמטרים בנתיב. תיאור שדות הגוף נמצא בסכמות ה-zod ב-backend/src/validate.js.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { createApp } = await import("../src/app.js");
const { openDb } = await import("../src/db.js");
const { createMailer } = await import("../src/email.js");

const db = openDb(":memory:");
const app = createApp({ db, mailer: createMailer(db, { host: "", adminEmail: "" }) });

/** @type {Map<string, Set<string>>} */
const routes = new Map();
const walk = (stack, prefix = "") => {
  for (const layer of stack) {
    if (layer.route) {
      const p = prefix + layer.route.path;
      for (const m of Object.keys(layer.route.methods)) {
        if (!routes.has(p)) routes.set(p, new Set());
        routes.get(p).add(m);
      }
    } else if (layer.handle?.stack) walk(layer.handle.stack, prefix);
  }
};
walk(app.router.stack);

const tagOf = (p) => (p.split("/")[2] || "root").replace(/[^a-z0-9-]/gi, "") || "root";
const paths = {};
for (const [p, methods] of [...routes].sort(([a], [b]) => a.localeCompare(b))) {
  const oaPath = p.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
  const params = [...p.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
  paths[oaPath] = {};
  for (const m of [...methods].sort()) {
    const admin = oaPath.startsWith("/api/admin/");
    paths[oaPath][m] = {
      tags: [tagOf(oaPath)],
      ...(params.length ? { parameters: params } : {}),
      ...(admin ? { description: "לאדמין בלבד." } : {}),
      responses: { 200: { $ref: "#/components/responses/Ok" }, 400: { $ref: "#/components/responses/Bad" }, 401: { $ref: "#/components/responses/Auth" } },
    };
  }
}
const doc = {
  openapi: "3.0.3",
  info: { title: "מחולל פעולות, שבט מעוז", version: "66", description: "מפת הנתיבים שנוצרה אוטומטית מהשרת (backend/scripts/gen-openapi.mjs). שגיאות מוחזרות כ-{error:{code,message,fields?}}." },
  paths,
  components: { responses: { Ok: { description: "הצלחה" }, Bad: { description: "קלט לא תקין" }, Auth: { description: "נדרשת התחברות" } } },
};
const out = path.join(root, "docs/openapi.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(doc, null, 1) + "\n");
const count = Object.values(paths).reduce((s, v) => s + Object.keys(v).length, 0);
console.log(`נכתבו ${count} נתיבים (${Object.keys(paths).length} כתובות) אל ${path.relative(root, out)}`);
process.exit(0);
