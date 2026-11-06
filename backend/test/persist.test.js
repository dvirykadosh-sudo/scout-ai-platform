import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import zlib from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { restoreIfMissing, startPersist } from "../src/persist.js";

function fakeGithub() {
  const store = { content: null, sha: null, puts: 0 };
  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (d) => chunks.push(d));
    req.on("end", () => {
      if (req.headers.authorization !== "Bearer tok") return res.writeHead(401).end();
      if (req.method === "GET") {
        if (!store.content) return res.writeHead(404).end("{}");
        if (/raw/.test(req.headers.accept)) return res.writeHead(200).end(Buffer.from(store.content, "base64"));
        return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ sha: store.sha }));
      }
      const b = JSON.parse(Buffer.concat(chunks).toString());
      if (store.sha && b.sha !== store.sha) return res.writeHead(409).end("{}");
      store.content = b.content; store.sha = "sha" + ++store.puts;
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ content: { sha: store.sha } }));
    });
  });
  return new Promise((ok) => srv.listen(0, () => ok({ srv, store, url: `http://127.0.0.1:${srv.address().port}` })));
}

describe("שמירת נתונים ב-GitHub", () => {
  it("שומר צילום ומשחזר אותו כשאין קובץ מקומי", async () => {
    const { srv, store, url } = await fakeGithub();
    const env = { DATA_REPO: "me/data", DATA_TOKEN: "tok", DATA_API_URL: url };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "persist-"));
    const file = path.join(dir, "a.db");
    const quiet = () => {};
    assert.equal(await restoreIfMissing(file, { env, log: quiet }), "none");
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE t(x TEXT); INSERT INTO t VALUES ('שלום')");
    const p = startPersist(db, file, { env, log: quiet, pollMs: 3_600_000 });
    assert.equal(await p.flush(), true);
    assert.ok(store.content);
    db.exec("INSERT INTO t VALUES ('עוד')");
    assert.equal(await p.push({ force: true }), true, "שינוי נשמר שוב (409/sha מטופל)");
    assert.equal(await p.push({ force: true }), false, "בלי שינוי אין שמירה");
    db.close();
    fs.rmSync(file);
    assert.equal(await restoreIfMissing(file, { env, log: quiet }), "restored");
    const back = new DatabaseSync(file);
    assert.deepEqual(back.prepare("SELECT x FROM t ORDER BY rowid").all().map((r) => r.x), ["שלום", "עוד"]);
    back.close();
    srv.close();
  });
  it("בלי הגדרות לא עושה כלום", async () => {
    assert.equal(await restoreIfMissing("/tmp/none.db", { env: {} }), "off");
    assert.equal(startPersist({}, "/tmp/none.db", { env: {} }), null);
  });
});

import { applyPendingRestore, pendingPath } from "../src/ops.js";
describe("שחזור באתחול", () => {
  it("מחליף את המסד בקובץ הממתין ושומר את הקודם", async () => {
    const fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rs-"));
    const db = path.join(dir, "x.db");
    fs.writeFileSync(db, "old");
    assert.equal(applyPendingRestore(db), false);
    fs.writeFileSync(pendingPath(db), "new");
    assert.equal(applyPendingRestore(db), true);
    assert.equal(fs.readFileSync(db, "utf8"), "new");
    assert.equal(fs.readFileSync(db + ".before-restore", "utf8"), "old");
    assert.equal(fs.existsSync(pendingPath(db)), false);
  });
});
