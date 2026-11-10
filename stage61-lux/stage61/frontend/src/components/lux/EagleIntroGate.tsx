"use client";

// שער קטן שנטען עם כל עמוד: מחליט אם להציג את אנימציית הנשר, ורק אז טוען את הקוד הכבד שלה.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { INTRO_EVENT, introShouldShow, markIntroSeen } from "@/lib/lux/intro";

const EagleIntro = dynamic(() => import("./EagleIntro").then((m) => m.EagleIntro), { ssr: false });

export function EagleIntroGate() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (introShouldShow()) {
      markIntroSeen();
      document.documentElement.dataset.intro = "1"; // כדי שמסך הלוגו הישן לא יופיע לפני הנשר
      setOpen(true);
    }
    const again = () => setOpen(true);
    window.addEventListener(INTRO_EVENT, again);
    return () => window.removeEventListener(INTRO_EVENT, again);
  }, []);
  return open ? <EagleIntro onClose={() => setOpen(false)} /> : null;
}
