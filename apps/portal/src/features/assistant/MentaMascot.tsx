import { useEffect, useId, useState } from "react";
import { motion, useMotionValue, useTransform, type MotionValue } from "motion/react";

export type MentaMood = "idle" | "greeting" | "thinking" | "happy" | "oops" | "sleepy";

// Every mouth shares one path structure so Motion can morph between them.
const MOUTH: Record<MentaMood, string> = {
  idle: "M42 68 Q50 75 58 68",
  greeting: "M40 65 Q50 85 60 65",
  happy: "M41 66 Q50 82 59 66",
  thinking: "M45 70 Q50 70 55 70",
  oops: "M42 73 Q50 66 58 73",
  sleepy: "M45 69 Q50 72 55 69",
};

const EYE_OPENNESS: Record<MentaMood, number> = {
  idle: 1,
  greeting: 0.7,
  happy: 0.62,
  thinking: 1,
  oops: 1,
  sleepy: 0.1,
};

const PUPIL_SHIFT: Record<MentaMood, { x: number; y: number }> = {
  idle: { x: 0, y: 0 },
  greeting: { x: 0, y: 0 },
  happy: { x: 0, y: 0 },
  thinking: { x: 2.6, y: -3 },
  oops: { x: 0, y: 2.6 },
  sleepy: { x: 0, y: 1 },
};

/**
 * Menta, drawn in SVG so it needs no design assets: a teal orb with a sprout
 * (growth, mentorship), expressive moods, blinking and pupils that follow the
 * pointer. `lookX`/`lookY` are normalised -1..1 values supplied by the parent.
 */
export function MentaMascot({
  mood,
  lookX,
  lookY,
  reduce,
  size,
}: {
  mood: MentaMood;
  lookX?: MotionValue<number>;
  lookY?: MotionValue<number>;
  reduce: boolean;
  size: number;
}) {
  const uid = useId().replace(/:/g, "");
  const idleX = useMotionValue(0);
  const idleY = useMotionValue(0);
  const pupilX = useTransform(lookX ?? idleX, (value) => value * 3.4);
  const pupilY = useTransform(lookY ?? idleY, (value) => value * 3);
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    if (reduce || mood === "sleepy") return;
    let blinkTimer: number | undefined;
    let reopenTimer: number | undefined;
    const schedule = () => {
      blinkTimer = window.setTimeout(() => {
        setBlink(true);
        reopenTimer = window.setTimeout(() => setBlink(false), 130);
        schedule();
      }, 2400 + Math.random() * 3600);
    };
    schedule();
    return () => {
      window.clearTimeout(blinkTimer);
      window.clearTimeout(reopenTimer);
    };
  }, [reduce, mood]);

  const eyeScale = blink ? 0.08 : EYE_OPENNESS[mood];
  const shift = PUPIL_SHIFT[mood];
  const smiling = mood === "greeting" || mood === "happy";

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      overflow="visible"
      aria-hidden="true"
      focusable="false"
      style={{ filter: "drop-shadow(0 8px 12px rgba(29,140,140,0.38))" }}
    >
      <defs>
        <radialGradient id={`${uid}-body`} cx="34%" cy="26%" r="85%">
          <stop offset="0%" stopColor="#5FD0C8" />
          <stop offset="55%" stopColor="#1D8C8C" />
          <stop offset="100%" stopColor="#0F6468" />
        </radialGradient>
        <linearGradient id={`${uid}-leaf`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9BE7C4" />
          <stop offset="100%" stopColor="#3E9A72" />
        </linearGradient>
      </defs>

      {/* Sprout */}
      <motion.g
        style={{ transformOrigin: "50px 24px" }}
        animate={reduce ? undefined : { rotate: mood === "greeting" ? [0, -14, 14, 0] : [-4, 5, -4] }}
        transition={
          mood === "greeting"
            ? { duration: 0.9 }
            : { duration: 4.2, repeat: Infinity, ease: "easeInOut" }
        }
      >
        <path d="M50 26 C50 19 50 15 52 10" stroke="#3E9A72" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <path d="M51 16 C42 5 31 9 34 18 C42 21 48 20 51 16Z" fill={`url(#${uid}-leaf)`} />
        <path d="M52 12 C58 2 70 5 68 14 C61 17 55 16 52 12Z" fill={`url(#${uid}-leaf)`} />
      </motion.g>

      {/* Body */}
      <ellipse cx="50" cy="57" rx="38" ry="35" fill={`url(#${uid}-body)`} />
      <ellipse cx="34" cy="38" rx="14" ry="8" fill="#fff" opacity="0.22" transform="rotate(-24 34 38)" />

      {/* Cheeks */}
      <ellipse cx="27" cy="66" rx="5.5" ry="3.2" fill="#FF9DB0" opacity={smiling ? 0.7 : 0.42} />
      <ellipse cx="73" cy="66" rx="5.5" ry="3.2" fill="#FF9DB0" opacity={smiling ? 0.7 : 0.42} />

      {/* Eyes */}
      <motion.g
        animate={{ scaleY: eyeScale }}
        transition={{ duration: 0.12 }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        {[37, 63].map((cx) => (
          <g key={cx}>
            <ellipse cx={cx} cy="54" rx="8.5" ry="10" fill="#fff" />
            <motion.g animate={{ x: shift.x, y: shift.y }} transition={{ type: "spring", stiffness: 140, damping: 16 }}>
              <motion.g style={{ x: pupilX, y: pupilY }}>
                <circle cx={cx} cy="55" r="5" fill="#0D1B33" />
                <circle cx={cx + 1.8} cy="52.6" r="1.7" fill="#fff" />
              </motion.g>
            </motion.g>
          </g>
        ))}
      </motion.g>

      {/* Mouth */}
      <motion.path
        initial={false}
        animate={{ d: MOUTH[mood], fill: smiling ? "#0D1B33" : "rgba(13,27,51,0)" }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        stroke="#0D1B33"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {mood === "thinking" &&
        [74, 82, 90].map((cx, index) => (
          <motion.circle
            key={cx}
            cx={cx}
            cy={22 - index * 4}
            r="2.8"
            fill="#1D8C8C"
            animate={reduce ? { opacity: 1 } : { opacity: [0.25, 1, 0.25], scale: [0.8, 1.15, 0.8] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: index * 0.18 }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        ))}

      {mood === "sleepy" &&
        [0, 1].map((index) => (
          <motion.text
            key={index}
            x={78 + index * 8}
            y={28}
            fontSize={13 - index * 2}
            fontWeight={800}
            fill="#0D1B33"
            animate={reduce ? { opacity: 0.7 } : { y: [28, 10], opacity: [0, 0.85, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, delay: index * 0.9 }}
          >
            z
          </motion.text>
        ))}
    </svg>
  );
}
