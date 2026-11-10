import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AnimatePresence,
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import { X } from "lucide-react";
import { ApiError, askMenta, getAIStatus, getMentaNavigation, type CurrentUser, type MentaTurn } from "../../services/api";
import { MentaMascot, type MentaMood } from "./MentaMascot";
import { MentaPanel, type ChatMessage } from "./MentaPanel";
import {
  clearConversation,
  hasGreeted,
  markGreeted,
  readConversation,
  readPosition,
  readWander,
  writeConversation,
  writePosition,
  writeWander,
  type Point,
} from "./storage";
import { currentDestination, isSafeHref, matchDestinations } from "./navigation";
import { MENTA_OPEN_EVENT, type MentaOpenDetail } from "./events";

const MARGIN = 12;
const NUDGE = 16;
const MAX_HISTORY = 12;
const TOP_SAFE_ZONE = 96; // keep wandering clear of the portal header
const SLEEP_AFTER_MS = 90_000;
const FIRST_ROAM_IDLE_MS = 12_000;

const SUGGESTIONS: Record<string, string[]> = {
  student: [
    "What do I need to do before my placement starts?",
    "How do I sign my placement acknowledgement?",
    "How do I share feedback?",
  ],
  mentor: [
    "How do I log a session for several students?",
    "What is group induction?",
    "How should I give constructive feedback?",
  ],
  nurse_manager: [
    "How do I reassign a mentor?",
    "What can I see in facility reports?",
    "What happens when a placement is paused?",
  ],
  coordinator: [
    "How do I invite a whole cohort?",
    "How do I release a placement?",
    "What can I not do as a coordinator?",
  ],
  program_admin: [
    "How do I publish a training module?",
    "How do I manage people and access?",
    "What do the reports show?",
  ],
};

// Short, true-to-product nudges shown with the first greeting of a session.
const ROLE_TIPS: Record<string, string> = {
  student: "Ask me how orientation or signing your placement works.",
  mentor: "Tip: one session log can cover up to 100 students.",
  nurse_manager: "Ask me about reassigning mentors or placement states.",
  coordinator: "Ask me how to invite a whole cohort by CSV.",
  program_admin: "Ask me about publishing modules or managing access.",
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const random = (min: number, max: number) => min + Math.random() * (max - min);

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function useViewport() {
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return viewport;
}

export function MentaBuddy({ user }: { user: CurrentUser }) {
  const status = useQuery({
    queryKey: ["ai-status"],
    queryFn: getAIStatus,
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (!status.data?.assistant) return null;
  return <MentaWidget user={user} />;
}

function MentaWidget({ user }: { user: CurrentUser }) {
  const reduce = useReducedMotion() ?? false;
  const location = useLocation();
  const routerNavigate = useNavigate();
  const { w, h } = useViewport();
  const narrow = w < 640;
  const size = narrow ? 56 : 68;
  const maxX = Math.max(MARGIN, w - size - MARGIN);
  // On phones the bottom tab bar (~64px) must stay reachable, so Menta rests above it.
  const bottomInset = narrow ? 72 : 0;
  const maxY = Math.max(MARGIN, h - size - MARGIN - bottomInset);
  const firstName = user.name && user.name !== "Name not set" ? user.name.trim().split(/\s+/)[0] : "";
  const greeting = timeGreeting();

  // ---- position -----------------------------------------------------------
  const [initial] = useState<Point>(() => {
    const saved = readPosition() ?? { x: w - size - 20, y: h - size - 24 - bottomInset };
    return { x: clamp(saved.x, MARGIN, maxX), y: clamp(saved.y, MARGIN, maxY) };
  });
  const x = useMotionValue(initial.x);
  const y = useMotionValue(initial.y);
  const [anchor, setAnchor] = useState<Point>(initial);
  const [side, setSide] = useState<"left" | "right">(initial.x > w / 2 ? "left" : "right");
  const dragControls = useDragControls();
  const moveAnimations = useRef<{ stop: () => void }[]>([]);

  const stopMoving = useCallback(() => {
    moveAnimations.current.forEach((controls) => controls.stop());
    moveAnimations.current = [];
  }, []);
  const syncAnchor = useCallback(() => setAnchor({ x: x.get(), y: y.get() }), [x, y]);
  const persist = useCallback(() => {
    writePosition({ x: x.get(), y: y.get() });
    syncAnchor();
  }, [x, y, syncAnchor]);

  useMotionValueEvent(x, "change", (value) => {
    const next = w - (value + size) >= value ? "right" : "left";
    setSide((current) => (current === next ? current : next));
  });

  // Keep Menta on screen when the window changes.
  useEffect(() => {
    x.set(clamp(x.get(), MARGIN, maxX));
    y.set(clamp(y.get(), MARGIN, maxY));
    syncAnchor();
  }, [maxX, maxY, x, y, syncAnchor]);

  // ---- liveliness: eyes, tilt, squash ------------------------------------
  const lookXTarget = useMotionValue(0);
  const lookYTarget = useMotionValue(0);
  const lookX = useSpring(lookXTarget, { stiffness: 110, damping: 16 });
  const lookY = useSpring(lookYTarget, { stiffness: 110, damping: 16 });
  const vx = useVelocity(x);
  const vy = useVelocity(y);
  const tilt = useSpring(useTransform(vx, [-1800, 1800], [-16, 16], { clamp: true }), { stiffness: 220, damping: 20 });
  const speed = useTransform([vx, vy], ([a, b]: number[]) => Math.hypot(a, b));
  const stretch = useSpring(useTransform(speed, [0, 2400], [1, 1.14], { clamp: true }), { stiffness: 220, damping: 20 });
  const squash = useTransform(stretch, (value) => 1 / value);

  // ---- state --------------------------------------------------------------
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [sleepy, setSleepy] = useState(false);
  const [flash, setFlash] = useState<MentaMood | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [wander, setWander] = useState(readWander);
  const [messages, setMessages] = useState<ChatMessage[]>(() => readConversation(user.id));
  const [draft, setDraft] = useState("");
  const lastActivity = useRef(Date.now());
  const flashTimer = useRef<number | undefined>(undefined);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const perchedFrom = useRef<Point | null>(null);

  const flashMood = useCallback((mood: MentaMood, ms: number) => {
    window.clearTimeout(flashTimer.current);
    setFlash(mood);
    flashTimer.current = window.setTimeout(() => setFlash(null), ms);
  }, []);

  const navigationQuery = useQuery({
    queryKey: ["menta-navigation", user.role],
    queryFn: getMentaNavigation,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const ask = useMutation({
    mutationFn: ({ message, history }: { message: string; history: MentaTurn[] }) =>
      askMenta(message, history, `${location.pathname}${location.search}`),
    onSuccess: (data) => {
      flashMood("happy", 1800);
      setMessages((current) => [
        ...current.map((message) => ({ ...message, fresh: false })),
        { role: "assistant", content: data.reply, sources: data.sources, actions: data.actions, fresh: true },
      ]);
    },
    onError: (cause) => {
      flashMood("oops", 2200);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          failed: true,
          content:
            cause instanceof ApiError && cause.status < 500
              ? cause.message
              : "I couldn’t answer just now. Please try again in a moment.",
        },
      ]);
    },
  });

  const mood: MentaMood = ask.isPending ? "thinking" : (flash ?? (sleepy ? "sleepy" : "idle"));

  // ---- pointer: eyes follow the cursor; any activity wakes Menta ----------
  useEffect(() => {
    let frame = 0;
    const wake = () => {
      lastActivity.current = Date.now();
      setSleepy((current) => (current ? false : current));
    };
    const onMove = (event: PointerEvent) => {
      wake();
      if (reduce) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        lookXTarget.set(clamp((event.clientX - (x.get() + size / 2)) / 260, -1, 1));
        lookYTarget.set(clamp((event.clientY - (y.get() + size / 2)) / 260, -1, 1));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("keydown", wake);
    window.addEventListener("pointerdown", wake);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("pointerdown", wake);
    };
  }, [reduce, size, x, y, lookXTarget, lookYTarget]);

  // Doze off after a while without any interaction.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!open && Date.now() - lastActivity.current > SLEEP_AFTER_MS) setSleepy(true);
    }, 5_000);
    return () => window.clearInterval(id);
  }, [open]);

  // ---- greeting: once per session ----------------------------------------
  useEffect(() => {
    if (hasGreeted(user.id)) return;
    let hide: number | undefined;
    const show = window.setTimeout(() => {
      markGreeted(user.id);
      setBubble(`${greeting}${firstName ? `, ${firstName}` : ""}!`);
      flashMood("greeting", 1900);
      hide = window.setTimeout(() => setBubble(null), 9_000);
    }, 1_400);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
    // The greeting is intentionally computed once for this session.
  }, [user.id]);

  // ---- wandering ----------------------------------------------------------
  const wanderAvailable = !reduce && w >= 768;
  const busy = open || dragging || hovered || focused || ask.isPending;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (!wander || !wanderAvailable) return;
    let timer: number | undefined;
    let cancelled = false;
    const schedule = (ms: number) => {
      timer = window.setTimeout(roam, ms);
    };
    async function roam() {
      if (cancelled) return;
      const idleFor = Date.now() - lastActivity.current;
      if (busyRef.current || document.hidden || idleFor < FIRST_ROAM_IDLE_MS) {
        schedule(8_000);
        return;
      }
      let target: Point | null = null;
      for (let attempt = 0; attempt < 8 && !target; attempt++) {
        // Stroll only over page content: never over the sidebar or the header.
        const sidebar = document.querySelector(".portal-sidebar")?.getBoundingClientRect();
        const minX = Math.min(maxX, (sidebar && sidebar.right > 0 ? sidebar.right : 0) + MARGIN * 2);
        const candidate = { x: random(minX, maxX), y: random(Math.min(TOP_SAFE_ZONE, maxY), maxY) };
        if (Math.hypot(candidate.x - x.get(), candidate.y - y.get()) > 200) target = candidate;
      }
      if (!target) {
        schedule(10_000);
        return;
      }
      // Different spring feel per axis makes the stroll arc instead of sliding.
      const moveX = animate(x, target.x, { type: "spring", stiffness: 38, damping: 13 });
      const moveY = animate(y, target.y, { type: "spring", stiffness: 26, damping: 9 });
      moveAnimations.current = [moveX, moveY];
      await Promise.all([moveX, moveY]);
      if (cancelled) return;
      moveAnimations.current = [];
      persist();
      schedule(random(22_000, 45_000));
    }
    schedule(random(14_000, 24_000));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [wander, wanderAvailable, maxX, maxY, x, y, persist]);

  // ---- open / close -------------------------------------------------------
  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    // Root cause of "only the X closes it": the panel is a non-modal floating
    // window with no backdrop and no outside-press listener. Close it when the
    // press lands anywhere except the panel or Menta's own button (that button
    // already toggles, so including it would close and immediately reopen).
    const onOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (document.getElementById("menta-panel")?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      // Leave focus where the user clicked rather than yanking it back to Menta.
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutsidePress, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutsidePress, true);
    };
  }, [open, close]);

  // On phones the chat is a bottom sheet; Menta perches on top of it.
  useEffect(() => {
    if (!narrow) return;
    const sheetHeight = Math.min(h * 0.7, 544);
    const sheetTop = h - MARGIN - sheetHeight;
    if (open && y.get() + size > sheetTop - 8) {
      perchedFrom.current = { x: x.get(), y: y.get() };
      moveAnimations.current = [animate(y, Math.max(MARGIN, sheetTop - size - 10), { type: "spring", stiffness: 260, damping: 26 })];
    } else if (!open && perchedFrom.current) {
      const back = perchedFrom.current;
      perchedFrom.current = null;
      moveAnimations.current = [animate(y, clamp(back.y, MARGIN, maxY), { type: "spring", stiffness: 200, damping: 24 })];
    }
  }, [open, narrow, h, size, maxY, x, y]);

  const toggle = () => {
    stopMoving();
    setBubble(null);
    syncAnchor();
    setOpen((current) => !current);
  };

  const onButtonKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const delta: Record<string, Point> = {
      ArrowLeft: { x: -NUDGE, y: 0 },
      ArrowRight: { x: NUDGE, y: 0 },
      ArrowUp: { x: 0, y: -NUDGE },
      ArrowDown: { x: 0, y: NUDGE },
    };
    const step = delta[event.key];
    if (event.shiftKey && step) {
      event.preventDefault();
      stopMoving();
      moveAnimations.current = [
        animate(x, clamp(x.get() + step.x, MARGIN, maxX), { type: "spring", stiffness: 400, damping: 30 }),
        animate(y, clamp(y.get() + step.y, MARGIN, maxY), { type: "spring", stiffness: 400, damping: 30 }),
      ];
      window.setTimeout(persist, 250);
    }
  };

  const send = (text: string) => {
    const message = text.trim();
    if (!message || ask.isPending) return;
    const history = messages
      .filter((turn) => !turn.failed)
      .slice(-MAX_HISTORY)
      .map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, { role: "user", content: message }]);
    setDraft("");
    ask.mutate({ message, history });
  };

  // Keep the conversation across screens and reloads for this tab session.
  useEffect(() => {
    if (!ask.isPending) writeConversation(user.id, messages);
  }, [messages, ask.isPending, user.id]);

  const resetConversation = () => {
    setMessages([]);
    clearConversation(user.id);
  };

  const goTo = (href: string) => {
    if (!isSafeHref(href)) return;
    routerNavigate(href);
    flashMood("happy", 1200);
    if (narrow) setOpen(false);
  };

  // Open from the sidebar card / other buttons, and with Ctrl/Cmd + K.
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const onOpen = (event: Event) => {
      const prompt = (event as CustomEvent<MentaOpenDetail>).detail?.prompt;
      stopMoving();
      setBubble(null);
      syncAnchor();
      setOpen(true);
      if (prompt) sendRef.current(prompt);
    };
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        stopMoving();
        setBubble(null);
        syncAnchor();
        setOpen((current) => !current);
      }
    };
    window.addEventListener(MENTA_OPEN_EVENT, onOpen);
    window.addEventListener("keydown", onShortcut);
    return () => {
      window.removeEventListener(MENTA_OPEN_EVENT, onOpen);
      window.removeEventListener("keydown", onShortcut);
    };
  }, [stopMoving, syncAnchor]);

  const toggleWander = () => {
    const next = !wander;
    setWander(next);
    writeWander(next);
  };

  // ---- layout of the panel and greeting bubble ---------------------------
  const centerX = anchor.x + size / 2;
  const centerY = anchor.y + size / 2;
  const alignRight = centerX > w / 2;
  const placeAbove = centerY > h / 2;
  const available = placeAbove ? anchor.y - 12 - MARGIN : h - (anchor.y + size + 12) - MARGIN;
  const placement = narrow
    ? { left: MARGIN, right: MARGIN, bottom: MARGIN, height: Math.min(h * 0.7, 544) }
    : {
        ...(alignRight ? { right: Math.max(MARGIN, w - anchor.x - size) } : { left: anchor.x }),
        ...(placeAbove ? { bottom: h - anchor.y + 12 } : { top: anchor.y + size + 12 }),
        width: Math.min(400, w - MARGIN * 2),
        height: Math.min(576, Math.max(300, available)),
      };
  const origin = narrow ? "bottom center" : `${placeAbove ? "bottom" : "top"} ${alignRight ? "right" : "left"}`;
  const destinations = navigationQuery.data ?? [];
  const here = currentDestination(destinations, location.pathname, location.search);
  const suggestions = [...new Set([...(here?.asks ?? []), ...(SUGGESTIONS[user.role] ?? [])])].slice(0, 3);
  // While typing, live jump suggestions replace the static quick links.
  const quickLinks = draft.trim() ? [] : destinations.filter((d) => d.id !== here?.id && d.id !== "account").slice(0, 4);
  const jumpMatches = draft.trim().length >= 2 ? matchDestinations(destinations, draft).filter((d) => d.id !== here?.id) : [];
  // The greeting sits above Menta (or below it when Menta is in the top half) and is
  // aligned to Menta's outer edge, so it can never run off the bottom of the screen.
  const roomForBubble = side === "right" ? w - x.get() - MARGIN : x.get() + size - MARGIN;
  const bubbleWidth = clamp(roomForBubble, 150, 260);
  const bubbleAbove = placeAbove;
  const tip = ROLE_TIPS[user.role];

  return (
    <div className="print:hidden">
      <motion.div
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={!reduce}
        dragElastic={0.12}
        dragConstraints={{ left: MARGIN, right: maxX, top: MARGIN, bottom: maxY }}
        dragTransition={{ power: 0.28, timeConstant: 260, bounceStiffness: 260, bounceDamping: 22 }}
        onDragStart={() => {
          stopMoving();
          setDragging(true);
          setBubble(null);
        }}
        onDragEnd={() => setDragging(false)}
        onDragTransitionEnd={persist}
        style={{ x, y, width: size, height: size, left: 0, top: 0, position: "fixed", pointerEvents: "none" }}
        className="z-[60]"
      >
        <AnimatePresence>
          {bubble && !open && (
            <motion.div
              key="greeting"
              role="status"
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
              transition={{ type: "spring", stiffness: 360, damping: 24 }}
              style={{
                width: bubbleWidth,
                [side === "right" ? "left" : "right"]: 0,
                [bubbleAbove ? "bottom" : "top"]: size + 12,
                transformOrigin: `${bubbleAbove ? "bottom" : "top"} ${side === "right" ? "left" : "right"}`,
              }}
              className="pointer-events-auto absolute"
            >
              <div className="relative rounded-2xl bg-white p-3 pr-8 font-body shadow-[0_12px_40px_-8px_rgba(13,27,51,0.35)] ring-1 ring-navy/10">
                <button
                  type="button"
                  onClick={() => {
                    setBubble(null);
                    toggle();
                  }}
                  className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                >
                  <span className="block font-display text-base font-bold text-navy">{bubble}</span>
                  {tip && <span className="mt-0.5 block text-xs leading-5 text-navy-muted">{tip}</span>}
                </button>
                <button
                  type="button"
                  aria-label="Dismiss greeting"
                  onClick={() => setBubble(null)}
                  className="absolute right-1.5 top-1.5 rounded-full p-1 text-navy-muted hover:bg-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                >
                  <X aria-hidden className="h-3.5 w-3.5" />
                </button>
                <span
                  aria-hidden
                  className={`absolute h-3 w-3 rotate-45 bg-white ring-1 ring-navy/10 ${
                    bubbleAbove ? "-bottom-1.5" : "-top-1.5"
                  }`}
                  style={{
                    [side === "right" ? "left" : "right"]: size / 2 - 6,
                    clipPath: bubbleAbove ? "polygon(100% 0, 100% 100%, 0 100%)" : "polygon(0 0, 100% 0, 0 100%)",
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Soft ground shadow that sits under Menta as it floats. */}
        <span aria-hidden className="absolute -bottom-1.5 left-1/2 h-2.5 w-3/5 -translate-x-1/2 rounded-full bg-navy/20 blur-[4px]" />

        <motion.button
          ref={buttonRef}
          type="button"
          aria-label="Menta, your AI buddy"
          aria-expanded={open}
          aria-controls="menta-panel"
          aria-describedby="menta-hint"
          onPointerDown={(event) => dragControls.start(event)}
          onTap={toggle}
          onHoverStart={() => setHovered(true)}
          onHoverEnd={() => setHovered(false)}
          // Only keyboard focus pauses wandering; a mouse user closing the panel must not freeze Menta.
          onFocus={(event) => setFocused(event.currentTarget.matches(":focus-visible"))}
          onBlur={() => setFocused(false)}
          onKeyDown={onButtonKeyDown}
          whileHover={reduce ? undefined : { scale: 1.08 }}
          whileTap={reduce ? undefined : { scale: 0.94 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
          style={{ width: size, height: size, touchAction: "none", rotate: reduce ? 0 : tilt, scaleY: reduce ? 1 : stretch, scaleX: reduce ? 1 : squash }}
          className="pointer-events-auto relative cursor-grab rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-navy/40 active:cursor-grabbing"
        >
          <motion.div
            animate={
              reduce
                ? undefined
                : mood === "sleepy"
                  ? { scale: [1, 1.05, 1] }
                  : { y: [0, -4, 0] }
            }
            transition={{ duration: mood === "sleepy" ? 4.6 : 3.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <motion.div
              key={mood}
              animate={
                reduce
                  ? undefined
                  : mood === "greeting"
                    ? { y: [0, -16, 0, -9, 0], rotate: [0, -8, 8, -4, 0] }
                    : mood === "happy"
                      ? { scale: [1, 1.14, 1] }
                      : mood === "oops"
                        ? { rotate: [0, -7, 7, -3, 0] }
                        : undefined
              }
              transition={{ duration: 0.9 }}
            >
              <MentaMascot mood={mood} lookX={lookX} lookY={lookY} reduce={reduce} size={size} />
            </motion.div>
          </motion.div>
        </motion.button>
        <span id="menta-hint" className="sr-only">
          Press Enter to open. Hold Shift and use the arrow keys, or drag, to move Menta.
        </span>
      </motion.div>

      <AnimatePresence>
        {open && (
          <MentaPanel
            firstName={firstName}
            greeting={greeting}
            mood={mood}
            messages={messages}
            pending={ask.isPending}
            draft={draft}
            suggestions={suggestions}
            reduce={reduce}
            wanderAvailable={wanderAvailable}
            wander={wander}
            placement={placement}
            origin={origin}
            dimmed={dragging}
            onDraft={setDraft}
            onSend={send}
            onReset={resetConversation}
            onClose={close}
            onToggleWander={toggleWander}
            onNavigate={goTo}
            screenLabel={here?.label}
            quickLinks={quickLinks}
            jumpMatches={jumpMatches}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
