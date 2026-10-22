"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useAuth, useToast } from "./Providers";
import { Field, Modal } from "./ui";

export interface Collection {
  id: number;
  name: string;
  items: { id: number; title: string; durationMin: number }[];
}

export function CollectionModal({ open, onClose, activityId }: { open: boolean; onClose: () => void; activityId: number }) {
  const { token, user } = useAuth();
  const toast = useToast();
  const [cols, setCols] = useState<Collection[]>([]);
  const [name, setName] = useState("");

  const load = () =>
    api<Collection[]>("/api/me/collections", { token })
      .then(setCols)
      .catch((e) => toast(errorMessage(e), { kind: "error" }));
  useEffect(() => {
    if (open && token) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token]);

  const toggle = async (c: Collection) => {
    const has = c.items.some((i) => i.id === activityId);
    try {
      if (has) await api(`/api/collections/${c.id}/items/${activityId}`, { method: "DELETE", token });
      else await api(`/api/collections/${c.id}/items`, { method: "POST", token, body: { activityId } });
      await load();
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const c = await api<Collection>("/api/me/collections", { method: "POST", token, body: { name } });
      await api(`/api/collections/${c.id}/items`, { method: "POST", token, body: { activityId } });
      setName("");
      toast(`נוצר האוסף "${c.name}" והפעולה נוספה אליו`, { kind: "success" });
      await load();
    } catch (err) {
      toast(errorMessage(err), { kind: "error" });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="הוספה לאוסף" footer={<button type="button" className="btn" onClick={onClose}>סגירה</button>}>
      {!user ? (
        <p>
          אוספים הם רשימות אישיות, למשל "מחזור ז' סתיו". <Link href="/account">התחברו</Link> כדי ליצור אוסף.
        </p>
      ) : (
        <>
          {cols.length === 0 && <p>עוד אין לכם אוספים. אפשר ליצור את הראשון.</p>}
          <ul className="plain-list">
            {cols.map((c) => (
              <li key={c.id}>
                <label className="check">
                  <input type="checkbox" checked={c.items.some((i) => i.id === activityId)} onChange={() => toggle(c)} />
                  <span>
                    {c.name} ({c.items.length})
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <form onSubmit={create} className="inline-form">
            <Field label="אוסף חדש" htmlFor="col-new">
              <input id="col-new" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </Field>
            <button type="submit" className="btn btn-primary" disabled={name.trim().length < 2}>
              יצירה והוספה
            </button>
          </form>
        </>
      )}
    </Modal>
  );
}
