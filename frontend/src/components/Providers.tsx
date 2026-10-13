"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { storageGet, storageSet } from "@/lib/api";

/* ───────────── accessibility settings ───────────── */
interface A11yCtx {
  highContrast: boolean;
  largeText: boolean;
  toggleContrast: () => void;
  toggleLarge: () => void;
}
const A11y = createContext<A11yCtx | null>(null);
export const useA11y = () => {
  const c = useContext(A11y);
  if (!c) throw new Error("A11y provider missing");
  return c;
};

/* ───────────── admin session ───────────── */
export interface SessionUser {
  username: string;
  mustChangePw: boolean;
}
interface AuthCtx {
  token: string | null;
  user: SessionUser | null;
  ready: boolean;
  setSession: (token: string, user: SessionUser) => void;
  clear: () => void;
}
const Auth = createContext<AuthCtx | null>(null);
export const useAuth = () => {
  const c = useContext(Auth);
  if (!c) throw new Error("Auth provider missing");
  return c;
};

/* ───────────── toasts ───────────── */
export interface ToastOptions {
  kind?: "info" | "success" | "error";
  action?: { label: string; onClick: () => void };
}
interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}
type ToastFn = (message: string, options?: ToastOptions) => void;
const Toast = createContext<ToastFn | null>(null);
export const useToast = () => {
  const c = useContext(Toast);
  if (!c) throw new Error("Toast provider missing");
  return c;
};

const SESSION_KEY = "scout.session";

export function Providers({ children }: { children: ReactNode }) {
  const [highContrast, setHc] = useState(false);
  const [largeText, setLarge] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  // restore settings (the inline script in layout already applied the classes before paint)
  useEffect(() => {
    setHc(document.documentElement.classList.contains("hc"));
    setLarge(document.documentElement.classList.contains("large"));
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw) as { token: string; user: SessionUser };
        setToken(s.token);
        setUser(s.user);
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const toggleContrast = useCallback(() => {
    setHc((v) => {
      document.documentElement.classList.toggle("hc", !v);
      storageSet("scout.hc", v ? "0" : "1");
      return !v;
    });
  }, []);
  const toggleLarge = useCallback(() => {
    setLarge((v) => {
      document.documentElement.classList.toggle("large", !v);
      storageSet("scout.large", v ? "0" : "1");
      return !v;
    });
  }, []);

  const setSession = useCallback((t: string, u: SessionUser) => {
    setToken(t);
    setUser(u);
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: t, user: u }));
    } catch {
      /* ignore */
    }
  }, []);
  const clear = useCallback(() => {
    setToken(null);
    setUser(null);
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const toast = useCallback<ToastFn>((message, options = {}) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, ...options }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), options.action ? 10000 : 6000);
  }, []);
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  const a11y = useMemo(() => ({ highContrast, largeText, toggleContrast, toggleLarge }), [highContrast, largeText, toggleContrast, toggleLarge]);
  const auth = useMemo(() => ({ token, user, ready, setSession, clear }), [token, user, ready, setSession, clear]);

  return (
    <A11y.Provider value={a11y}>
      <Auth.Provider value={auth}>
        <Toast.Provider value={toast}>
          {children}
          <div className="toast-region" role="region" aria-label="הודעות מערכת">
            {toasts.map((t) => (
              <div key={t.id} className={`toast toast-${t.kind ?? "info"}`} role={t.kind === "error" ? "alert" : "status"}>
                <span>{t.message}</span>
                {t.action && (
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
                <button type="button" className="icon-btn" aria-label="סגירת ההודעה" onClick={() => dismiss(t.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </Toast.Provider>
      </Auth.Provider>
    </A11y.Provider>
  );
}

export { storageGet };
