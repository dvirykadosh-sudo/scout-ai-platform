// שלב 61 (רעיון 11): תמונת שיתוף אמיתית לכל פעולה שפורסמה (וואטסאפ, פייסבוק, טלגרם). נוצרת בשרת לפי הכרזה האוטומטית.
// פעולות שלא פורסמו (טיוטה, ממתינה לאישור) מקבלות תמונת מותג כללית, כדי לא לחשוף כותרות.
import { ImageResponse } from "next/og";
import { visualRtl } from "@/lib/lux/bidi";
import { posterSvg, svgDataUri, titleLayout, wrap } from "@/lib/lux/poster";
import { loadActivity, siteUrl } from "@/lib/seo";

export const alt = "כרזת הפעולה | שבט מעוז";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

import { HEEBO_800_B64 } from "@/lib/lux/heebo-font";

const loadFont = async (): Promise<ArrayBuffer> => {
  const buf = Buffer.from(HEEBO_800_B64, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  try {
    const { data: a } = await loadActivity((await params).id);
    const pub = !!a && a.status === "PUBLISHED";
    const title = pub ? a.title : "מחולל פעולות לצופים";
    const value = pub ? a.leadingValue : "שבט מעוז";
    const chips = pub ? [a.ageGroup, `${a.durationMin} דקות`, `${a.stages.length} שלבים`] : [];
    const bg = svgDataUri(posterSvg({ title, value }, { theme: "tribe", format: "og", textless: true }));
    const { fs, lines, lh } = titleLayout(title, "og");
    const data = await loadFont();
    const W = 1200;
    const H = 630;
    const cx = W * 0.3;
    const top = H / 2 - ((lines.length - 1) * lh) / 2 - lh / 2;
    // ערך מוביל ארוך נשבר לשורות מראש (Satori לא יודע לשבור טקסט הפוך-חזותית), עד שתי שורות
    const vfs = Math.min(fs * 0.4, 40);
    const vLines = wrap(value, Math.floor(700 / (vfs * 0.6))).slice(0, 2);
    const vTop = top - vLines.length * vfs * 1.25 - 6;
    return new ImageResponse(
      (
        <div style={{ position: "relative", display: "flex", width: W, height: H, fontFamily: "Heebo", color: "#fff" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bg} width={W} height={H} alt="" style={{ position: "absolute", left: 0, top: 0 }} />
          {vLines.map((l, i) => (
            <div key={`v${i}`} style={{ position: "absolute", left: cx - 350, top: vTop + i * vfs * 1.25, width: 700, display: "flex", justifyContent: "center", fontSize: vfs, color: "#c4b5fd", whiteSpace: "nowrap" }}>
              {visualRtl(l)}
            </div>
          ))}
          {lines.map((l, i) => (
            <div key={i} style={{ position: "absolute", left: cx - 350, top: top + i * lh, width: 700, display: "flex", justifyContent: "center", fontSize: fs, lineHeight: 1.2, fontWeight: 800, whiteSpace: "nowrap" }}>
              {visualRtl(l)}
            </div>
          ))}
          <div style={{ position: "absolute", left: cx - 350, top: H * 0.8, width: 700, display: "flex", justifyContent: "center", gap: 14, flexDirection: "row-reverse" }}>
            {chips.map((c) => (
              <div key={c} style={{ display: "flex", padding: "6px 20px", borderRadius: 999, background: "rgba(255,255,255,.14)", fontSize: 28 }}>
                {visualRtl(c)}
              </div>
            ))}
          </div>
          <div style={{ position: "absolute", left: 0, bottom: 26, width: W * 0.6, display: "flex", justifyContent: "center", fontSize: 24, color: "#d9d0f5" }}>{visualRtl("שבט מעוז · מחולל פעולות")}</div>
        </div>
      ),
      { ...size, fonts: [{ name: "Heebo", data, weight: 800, style: "normal" }] },
    );
  } catch (e) {
    console.warn("[og-image]", (e as Error).message);
    return Response.redirect(new URL("/logo-maoz.png", siteUrl()), 302);
  }
}
