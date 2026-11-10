import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  CornerDownRight,
  Footprints,
  Info,
  Lightbulb,
  MessageCircle,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { FormattedReply, TypedReply } from "./format";
import { MentaMascot, type MentaMood } from "./MentaMascot";
import type { MentaAction, MentaDestination } from "../../services/api";

export const MAX_MESSAGE = 600;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: { title: string; kind: string }[];
  actions?: MentaAction[];
  failed?: boolean;
  fresh?: boolean;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy reply"}
      title={copied ? "Copied" : "Copy reply"}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="rounded-lg p-1.5 text-navy-muted transition-colors hover:bg-white hover:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
    >
      {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
    </button>
  );
}

function DestinationChip({ destination, onNavigate }: { destination: Pick<MentaDestination, "label" | "href">; onNavigate: (href: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(destination.href)}
      className="group inline-flex max-w-full items-center gap-1.5 rounded-xl border border-teal/30 bg-white px-2.5 py-1.5 text-xs font-semibold text-teal transition hover:border-teal hover:bg-teal hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
    >
      <span className="truncate">{destination.label}</span>
      <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

const SUGGESTION_ICONS = [BookOpen, Lightbulb, MessageCircle];

export function MentaPanel({
  firstName,
  greeting,
  mood,
  messages,
  pending,
  draft,
  suggestions,
  reduce,
  wanderAvailable,
  wander,
  placement,
  origin,
  dimmed,
  onDraft,
  onSend,
  onReset,
  onClose,
  onToggleWander,
  onNavigate,
  screenLabel,
  quickLinks,
  jumpMatches,
}: {
  firstName: string;
  greeting: string;
  mood: MentaMood;
  messages: ChatMessage[];
  pending: boolean;
  draft: string;
  suggestions: string[];
  reduce: boolean;
  wanderAvailable: boolean;
  wander: boolean;
  placement: CSSProperties;
  origin: string;
  dimmed: boolean;
  onDraft: (value: string) => void;
  onSend: (value: string) => void;
  onReset: () => void;
  onClose: () => void;
  onToggleWander: () => void;
  onNavigate: (href: string) => void;
  screenLabel?: string;
  quickLinks: MentaDestination[];
  jumpMatches: MentaDestination[];
}) {
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToEnd = useCallback(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, []);

  useLayoutEffect(scrollToEnd, [messages, pending, scrollToEnd]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  }, [draft]);

  return (
    <motion.section
      id="menta-panel"
      role="dialog"
      aria-label="Menta, your AI buddy"
      style={{ ...placement, transformOrigin: origin }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 14 }}
      animate={{ opacity: dimmed ? 0.35 : 1, scale: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 10 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={`fixed z-[55] flex flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_28px_80px_-16px_rgba(13,27,51,0.45)] ring-1 ring-navy/10 ${
        dimmed ? "pointer-events-none" : ""
      }`}
    >
      <header className="relative flex items-center gap-3 px-4 pb-3 pt-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-teal-light via-teal-light/40 to-transparent"
        />
        <div className="relative shrink-0">
          <MentaMascot mood={mood} reduce={reduce} size={44} />
        </div>
        <div className="relative min-w-0 flex-1">
          <p className="font-display text-lg font-bold leading-5 text-navy">Menta</p>
          <p className="flex items-center gap-1.5 font-body text-xs text-navy-muted" aria-live="polite">
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${pending ? "animate-pulse bg-terracotta" : "bg-success"}`} />
            {pending ? "Thinking…" : "Your mentorship buddy"}
          </p>
        </div>
        <div className="relative flex items-center gap-0.5">
          {wanderAvailable && (
            <button
              type="button"
              role="switch"
              aria-checked={wander}
              aria-label="Let Menta wander around the screen"
              title={wander ? "Menta wanders when idle (click to keep still)" : "Let Menta wander when idle"}
              onClick={onToggleWander}
              className={`rounded-full p-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${
                wander ? "bg-teal text-white" : "text-navy-muted hover:bg-mist"
              }`}
            >
              <Footprints aria-hidden className="h-4 w-4" />
            </button>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              aria-label="Start a new conversation"
              title="New conversation"
              onClick={onReset}
              className="rounded-full p-2 text-navy-muted transition-colors hover:bg-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
            >
              <RotateCcw aria-hidden className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            aria-label="Close Menta"
            onClick={onClose}
            className="rounded-full p-2 text-navy-muted transition-colors hover:bg-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div ref={logRef} role="log" aria-live="polite" aria-relevant="additions" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3 pt-1">
        {messages.length === 0 && (
          <div className="pt-2 font-body">
            <h2 className="font-display text-2xl font-bold leading-7 text-navy">
              {firstName ? `${greeting}, ${firstName}` : greeting}
            </h2>
            <p className="mt-1 text-sm leading-6 text-navy-muted">
              I’m Menta. Ask me anything about MentorMAMA, or tell me where you want to go.
            </p>
            {screenLabel && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-mist px-2 py-1 text-xs text-navy-muted">
                <CornerDownRight aria-hidden className="h-3 w-3 text-teal" />
                You’re on <span className="font-semibold text-navy">{screenLabel}</span>
              </p>
            )}
            <ul className="mt-4 space-y-2">
              {suggestions.map((suggestion, index) => {
                const Icon = SUGGESTION_ICONS[index % SUGGESTION_ICONS.length];
                return (
                  <motion.li
                    key={suggestion}
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 + index * 0.07, type: "spring", stiffness: 300, damping: 26 }}
                  >
                    <button
                      type="button"
                      onClick={() => onSend(suggestion)}
                      className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-white px-3 py-2.5 text-left text-sm text-navy transition hover:-translate-y-0.5 hover:border-teal/60 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-light text-teal transition-colors group-hover:bg-teal group-hover:text-white">
                        <Icon aria-hidden className="h-4 w-4" />
                      </span>
                      {suggestion}
                    </button>
                  </motion.li>
                );
              })}
            </ul>
            {quickLinks.length > 0 && (
              <div className="mt-4">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-navy-muted">Jump to</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {quickLinks.map((destination) => (
                    <DestinationChip key={destination.id} destination={destination} onNavigate={onNavigate} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {messages.map((message, index) => {
          const isLast = index === messages.length - 1;
          return (
            <motion.div
              key={index}
              initial={reduce ? false : { opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 340, damping: 28 }}
              className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 font-body text-sm leading-6 ${
                  message.role === "user"
                    ? "rounded-br-md bg-gradient-to-br from-teal to-[#16706f] text-white shadow-sm"
                    : message.failed
                      ? "rounded-bl-md border border-terracotta/40 bg-white text-navy"
                      : "rounded-bl-md bg-mist text-navy"
                }`}
              >
                {message.role === "assistant" && !message.failed ? (
                  <TypedReply text={message.content} animate={Boolean(message.fresh && isLast && !reduce)} onProgress={scrollToEnd} />
                ) : message.role === "assistant" ? (
                  <FormattedReply text={message.content} />
                ) : (
                  <p className="whitespace-pre-line">{message.content}</p>
                )}
                {message.actions && message.actions.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Open a screen">
                    {message.actions.map((action) => (
                      <DestinationChip key={action.id} destination={action} onNavigate={onNavigate} />
                    ))}
                  </div>
                )}
                {message.sources && message.sources.length > 0 && (
                  <ul className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border pt-2.5" aria-label="Sources">
                    {message.sources.map((source) => (
                      <li
                        key={source.title}
                        className="inline-flex max-w-full items-center gap-1 rounded-full bg-white px-2 py-1 text-[0.7rem] font-medium text-navy-muted ring-1 ring-border"
                      >
                        <BookOpen aria-hidden className="h-3 w-3 shrink-0 text-teal" />
                        <span className="truncate">{source.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {message.role === "assistant" && !message.failed && (
                  <div className="-mb-1 -mr-1.5 mt-1 flex justify-end">
                    <CopyButton text={message.content} />
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}

        {pending && (
          <div className="flex justify-start" role="status" aria-label="Menta is thinking">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-mist px-4 py-3">
              {[0, 1, 2].map((dot) => (
                <motion.span
                  key={dot}
                  aria-hidden
                  className="h-2 w-2 rounded-full bg-teal"
                  animate={reduce ? { opacity: [0.4, 1, 0.4] } : { y: [0, -5, 0], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: dot * 0.15 }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSend(draft);
        }}
        className="px-3 pb-3"
      >
        {jumpMatches.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1" aria-live="polite">
            <span className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-navy-muted">Jump to</span>
            {jumpMatches.map((destination) => (
              <DestinationChip key={destination.id} destination={destination} onNavigate={onNavigate} />
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-white p-1.5 shadow-sm transition focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/25">
          <label htmlFor="menta-input" className="sr-only">
            Message Menta
          </label>
          <textarea
            id="menta-input"
            ref={inputRef}
            rows={1}
            maxLength={MAX_MESSAGE}
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend(draft);
              }
            }}
            placeholder="Ask a question or type a screen name…"
            className="max-h-28 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2.5 py-2 font-body text-sm text-navy placeholder:text-navy-muted/70 focus:outline-none"
          />
          <motion.button
            type="submit"
            aria-label="Send message"
            disabled={pending || draft.trim().length === 0}
            whileTap={reduce ? undefined : { scale: 0.88 }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal to-[#16706f] text-white shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            <Send aria-hidden className="h-4 w-4" />
          </motion.button>
        </div>
        <p className="mt-2 flex items-start gap-1.5 px-1 font-body text-[0.68rem] leading-4 text-navy-muted">
          <Info aria-hidden className="mt-px h-3 w-3 shrink-0" />
          <span>
            Menta is AI and can make mistakes. Don’t enter patient or personal details, and don’t use it for clinical decisions.
            {draft.length > MAX_MESSAGE - 100 && ` ${MAX_MESSAGE - draft.length} characters left.`}
          </span>
        </p>
      </form>
    </motion.section>
  );
}
