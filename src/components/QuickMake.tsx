"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { errorMessage, storageGet, storageSet } from "@/lib/api";
import { AGE_GROUPS } from "@/lib/constants";
import { quickCreate, useKinds, type QuickBody } from "@/lib/kinds";
import { useAuth, useToast } from "./Providers";
import { Field } from "./ui";

const AGE_KEY = "scout.quick.age";

/** Age picker plus a creator that turns a topic, value and kind into an activity and opens it. */
export function useQuickMake() {
  const router = useRouter();
  const toast = useToast();
  const { token, user } = useAuth();
  const [age, setAge] = useState("כיתה ח' - מעורב");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const saved = storageGet(AGE_KEY);
    if (saved && AGE_GROUPS.includes(saved)) setAge(saved);
  }, []);
  const make = async (body: QuickBody) => {
    setBusy(true);
    try {
      storageSet(AGE_KEY, age);
      const a = await quickCreate(token, { ...body, ageGroup: age, ...(user ? { instructor: user.displayName } : {}) });
      toast(`נוצרה פעולה: ${a.title}`, { kind: "success" });
      router.push(`/library/${a.id}`);
    } catch (e) {
      toast(errorMessage(e), { kind: "error" });
      setBusy(false);
    }
  };
  return { age, setAge, busy, make };
}

export function AgeField({ id, age, setAge }: { id: string; age: string; setAge: (v: string) => void }) {
  return (
    <Field label="שכבת גיל" htmlFor={id}>
      <select id={id} value={age} onChange={(e) => setAge(e.target.value)}>
        {AGE_GROUPS.map((g) => (
          <option key={g}>{g}</option>
        ))}
      </select>
    </Field>
  );
}

export function KindField({ id, kind, setKind, empty }: { id: string; kind: string; setKind: (v: string) => void; empty: string }) {
  const kinds = useKinds();
  return (
    <Field label="סוג פעולה" htmlFor={id}>
      <select id={id} value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="">{empty}</option>
        {kinds.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
