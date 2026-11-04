"use client";

// חוט משיכה קפיצי: גוררים את הכדור למטה (או לוחצים/מקישים Enter) כדי להדליק או לכבות. החוט נמתח וחוזר בקפיצה.
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useRef } from "react";

const SPRING = { type: "spring" as const, stiffness: 200, damping: 20 };
const PULL_TO_TOGGLE = 36;

export function PullString({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const y = useMotionValue(0);
  const height = useTransform(y, (v) => 90 + v);
  const dragged = useRef(false);

  // לחיצה או מקלדת: "משיכה" קצרה והחלפת מצב
  const tap = async () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    onToggle();
    await animate(y, 34, SPRING);
    await animate(y, 0, SPRING);
  };

  return (
    <div className="lg-pull">
      <motion.div className="lg-string" style={{ height }} aria-hidden="true" />
      <motion.button
        type="button"
        className="lg-knob"
        aria-label="חוט התאורה של הנשר"
        aria-pressed={on}
        drag="y"
        dragConstraints={{ top: 0, bottom: 70 }}
        dragElastic={0.25}
        dragSnapToOrigin
        dragTransition={{ bounceStiffness: 200, bounceDamping: 20 }}
        transition={SPRING}
        style={{ y }}
        onDragStart={() => { dragged.current = true; }}
        onDragEnd={(_, info) => {
          if (info.offset.y > PULL_TO_TOGGLE) onToggle();
          window.setTimeout(() => { dragged.current = false; }, 60);
        }}
        onClick={tap}
      >
        <span aria-hidden="true">●</span>
      </motion.button>
    </div>
  );
}
