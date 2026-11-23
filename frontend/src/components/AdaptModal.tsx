"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { CONDITIONS } from "@/lib/constants";
import { CONDITION_CONFLICTS, MAX_CONDITIONS, type ConditionInfo } from "@/lib/lab74";
import type { Activity } from "@/lib/types";
import { useAuth, useToast } from "./Providers";
import { Modal } from "./ui";


export function AdaptModal({ open, onClose, activity }: { open: boolean; onClose: () => void; activity: Activity }) {
  const router = useRouter();
  const toast = useToast();
  const { token } = useAuth();
  const [picked, setPicked] = useState<string[]>([]);
  const [all, setAll] = useState<ConditionInfo[]>(() => CONDITIONS.map((c) => ({ key: c.key, label: c.label, group: "תנאים" })));
  const [busy, setBusy] = useState(false);

  // הרשימה המלאה מהשרת (כוללת חושך, בלי ציוד וקור). אם הבקשה נכשלת נשארת הרשימה המקומית.
  useEffect(() => {
    if (!open) return;
    api<ConditionInfo[]>("/api/adapt/conditions-all")
      // השמות של התנאים שהיו כבר נשארים כפי שהמדריכים מכירים אותם. תנאים חדשים (חושך, בלי ציוד, קור) מגיעים עם השם מהשרת
      .then((r) => r.length && setAll(r.map((c) => ({ ...c, label: CONDITIONS.find((x) => x.key === c.key)?.label ?? c.label }))))
      .catch(() => {});
  }, [open]);

  const groups = useMemo(() => {
    const m = new Map<string, ConditionInfo[]>();
    for (const c of all) m.set(c.group, [...(m.get(c.group) ?? []), c]);
    return [...m.entries()];
  }, [all]);
  const labelOf = (k: string) => all.find((c) => c.key === k)?.label ?? k;
  const clash = CONDITION_CONFLICTS.find(([x, y]) => picked.includes(x) && picked.includes(y));
  const toggle = (k: string) => setPicked((l) => (l.includes(k) ? l.filter((x) => x !== k) : l.length >= MAX_CONDITIONS ? l : [...l, k]));

  const go = async () => {
    setBusy(true);
    try {
      const copy = await api<Activity & { adaptation?: { applied: string[]; trimmed: boolean } }>(`/api/activities/${activity.id}/adapt-multi`, { method: "POST", token, body: { conditions: picked } });
      onClose();
      toast(copy.adaptation?.trimmed ? "נוצר עותק מותאם. חלק מההערות לא נכנסו במגבלת האורך, כדאי לעבור עליו" : "נוצר עותק מותאם. הפעולה המקורית לא השתנתה", { kind: "success" });
      router.push(`/library/${copy.id}`);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
    }
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="התאמה לתנאים"
      footer={
        <>
          <button type="button" className="btn btn-primary" onClick={go} disabled={busy || picked.length === 0 || !!clash}>
            {busy ? "יוצר..." : "יצירת עותק מותאם"}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            ביטול
          </button>
        </>
      }
    >
      <p>האתר יוצר עותק של "{activity.title}" עם הערות התאמה בכל שלב, ציוד והערת בטיחות מתאימים. אפשר לשלב עד {MAX_CONDITIONS} תנאים, למשל גשם וקבוצה גדולה. את ההערות אפשר לערוך אחר כך.</p>
      {groups.map(([group, list]) => (
        <fieldset key={group} className="adapt-group">
          <legend>{group}</legend>
          {list.map((c) => {
            const on = picked.includes(c.key);
            return (
              <label key={c.key} className="check">
                <input type="checkbox" checked={on} disabled={!on && picked.length >= MAX_CONDITIONS} onChange={() => toggle(c.key)} />
                <span>{c.label}</span>
              </label>
            );
          })}
        </fieldset>
      ))}
      <p className="hint" role="status">
        נבחרו {picked.length} מתוך {MAX_CONDITIONS}
        {picked.length ? `: ${picked.map(labelOf).join(", ")}` : ""}
      </p>
      {clash && (
        <p className="error-box" role="alert">
          אי אפשר לשלב "{labelOf(clash[0])}" עם "{labelOf(clash[1])}".
        </p>
      )}
    </Modal>
  );
}
