// סימן מים: לוגו השבט ממורכז מאחורי הטקסט בכל עמוד בקובצי Word. ההדפסה ל-PDF נעשית ב-CSS באתר.
import zlib from "node:zlib";
import JSZip from "jszip";
import { HorizontalPositionAlign, HorizontalPositionRelativeFrom, ImageRun, VerticalPositionAlign, VerticalPositionRelativeFrom } from "docx";

let source = () => null;
/** fn מחזירה { buf, type: "png" | "jpg" } או null. */
export function setWatermarkSource(fn) {
  source = typeof fn === "function" ? fn : () => null;
}

export function getWatermarkLogo() {
  try {
    return source();
  } catch {
    return null;
  }
}

export function size(img) {
  try {
    if (img.type === "png") return { w: img.buf.readUInt32BE(16), h: img.buf.readUInt32BE(20) };
  } catch {
    /* fallthrough */
  }
  return { w: 1, h: 1 };
}

/** מחליש PNG בפורמט RGBA בן 8 ביט ישירות בבתים (בלי ספריות). מחזיר null אם הפורמט שונה. */
export function fadePng(buf, factor = 0.12) {
  try {
    if (buf.readUInt32BE(0) !== 0x89504e47) return null;
    let o = 8, ihdr = null;
    const idat = [];
    while (o < buf.length) {
      const len = buf.readUInt32BE(o), type = buf.toString("ascii", o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
      if (type === "IHDR") ihdr = data;
      else if (type === "IDAT") idat.push(data);
      o += 12 + len;
    }
    if (!ihdr || ihdr[8] !== 8 || ihdr[9] !== 6 || ihdr[12] !== 0) return null;
    const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4), bpp = 4, stride = w * bpp;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const out = Buffer.alloc(h * (stride + 1));
    let prev = Buffer.alloc(stride);
    for (let y = 0; y < h; y++) {
      const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
        let add = 0;
        if (f === 1) add = a;
        else if (f === 2) add = b;
        else if (f === 3) add = (a + b) >> 1;
        else if (f === 4) {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        line[x] = (line[x] + add) & 255;
      }
      prev = Buffer.from(line);
      for (let x = 3; x < stride; x += 4) line[x] = Math.round(line[x] * factor);
      out[y * (stride + 1)] = 0;
      line.copy(out, y * (stride + 1) + 1);
    }
    const chunk = (type, data) => {
      const t = Buffer.from(type, "ascii"), len = Buffer.alloc(4), crc = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(Buffer.concat([t, data])) >>> 0 : crc32(Buffer.concat([t, data])) >>> 0);
      return Buffer.concat([len, t, data, crc]);
    };
    return Buffer.concat([buf.subarray(0, 8), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(out)), chunk("IEND", Buffer.alloc(0))]);
  } catch {
    return null;
  }
}
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** ריצה צפה בכותרת העליונה, מאחורי הטקסט. מחזירה מערך ריק כשאין לוגו. */
export function watermarkRuns() {
  let logo = null;
  try {
    logo = source();
  } catch {
    logo = null;
  }
  if (!logo?.buf) return [];
  const { w, h } = size(logo);
  const pre = logo.type === "png" ? fadePng(logo.buf, 0.12) : null;
  const W = 400;
  const H = Math.round((W * h) / w) || W;
  return [
    new ImageRun({
      type: logo.type,
      data: pre || logo.buf,
      transformation: { width: W, height: Math.min(H, 560) },
      altText: { title: "סימן מים", description: "לוגו השבט ברקע", name: pre ? "watermark-pre" : "watermark" },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.CENTER },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, align: VerticalPositionAlign.CENTER },
        behindDocument: true,
        allowOverlap: true,
        lockAnchor: true,
      },
    }),
  ];
}

/** מחליש את התמונה שבכותרות לשקיפות של כ-10 אחוזים (alphaModFix), כדי שהטקסט יישאר קריא. */
export async function fadeWatermark(buf) {
  try {
    const zip = await JSZip.loadAsync(buf);
    let changed = false;
    for (const name of Object.keys(zip.files)) {
      if (!/^word\/header\d*\.xml$/.test(name)) continue;
      let xml = await zip.file(name).async("string");
      if (xml.includes("watermark-pre") || xml.includes("doc-design")) continue;
      const next = xml.replace(/<a:blip ([^>]*?)\/>/g, '<a:blip $1><a:alphaModFix amt="12000"/></a:blip>');
      if (next !== xml) {
        zip.file(name, next);
        changed = true;
      }
    }
    return changed ? await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) : buf;
  } catch {
    return buf;
  }
}
