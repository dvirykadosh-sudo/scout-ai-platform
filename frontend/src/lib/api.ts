export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string[]>;
  constructor(status: number, code: string, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

interface Options {
  method?: string;
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
}

export async function api<T>(path: string, { method = "GET", body, token, signal }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      signal,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "NETWORK", "אין חיבור לשרת. ודאו שהשרת פועל (npm start בתיקיית backend).");
  }
  if (!res.ok) {
    let data: { error?: { code?: string; message?: string; fields?: Record<string, string[]> } } = {};
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, data.error?.code ?? "ERROR", data.error?.message ?? "אירעה שגיאה", data.error?.fields);
  }
  return (await res.json()) as T;
}

export async function downloadDocx(id: number, title: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/activities/${id}/export/docx`);
  } catch {
    throw new ApiError(0, "NETWORK", "אין חיבור לשרת");
  }
  if (!res.ok) throw new ApiError(res.status, "EXPORT", "ייצוא הקובץ נכשל");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // revoking immediately can cancel the download in some browsers
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : "אירעה שגיאה");

/** Flattens server field errors into one list of readable lines. */
export function fieldErrorLines(e: unknown): string[] {
  if (e instanceof ApiError && e.fields) return Object.values(e.fields).flat();
  return [];
}

export const fmtDate = (iso: string): string => new Date(iso).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });

export function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function storageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}
