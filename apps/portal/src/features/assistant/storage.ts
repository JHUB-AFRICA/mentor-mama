export interface Point {
  x: number;
  y: number;
}

const POSITION_KEY = "mentormama.menta.position";
const WANDER_KEY = "mentormama.menta.wander";
const greetedKey = (userId: string) => `mentormama.menta.greeted.${userId}`;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); Menta still works.
    return fallback;
  }
}

export function readPosition(): Point | null {
  return safe(() => {
    const raw = window.localStorage.getItem(POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Point>;
    return typeof parsed.x === "number" && typeof parsed.y === "number"
      ? { x: parsed.x, y: parsed.y }
      : null;
  }, null);
}

export function writePosition(point: Point) {
  safe(() => window.localStorage.setItem(POSITION_KEY, JSON.stringify(point)), undefined);
}

/** Wandering is on unless the user switched it off. */
export function readWander(): boolean {
  return safe(() => window.localStorage.getItem(WANDER_KEY) !== "off", true);
}

export function writeWander(enabled: boolean) {
  safe(() => window.localStorage.setItem(WANDER_KEY, enabled ? "on" : "off"), undefined);
}

/** The greeting appears once per browser session per user. */
export function hasGreeted(userId: string): boolean {
  return safe(() => window.sessionStorage.getItem(greetedKey(userId)) === "1", false);
}

export function markGreeted(userId: string) {
  safe(() => window.sessionStorage.setItem(greetedKey(userId), "1"), undefined);
}

// ---- Conversation: kept for this browser tab session only ------------------
const conversationKey = (userId: string) => `mentormama.menta.conversation.${userId}`;
const MAX_STORED_MESSAGES = 30;

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  sources?: { title: string; kind: string }[];
  actions?: { id: string; label: string; href: string }[];
  failed?: boolean;
}

export function readConversation(userId: string): StoredMessage[] {
  return safe(() => {
    const raw = window.sessionStorage.getItem(conversationKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is StoredMessage =>
          typeof item === "object" &&
          item !== null &&
          ((item as StoredMessage).role === "user" || (item as StoredMessage).role === "assistant") &&
          typeof (item as StoredMessage).content === "string",
      )
      .slice(-MAX_STORED_MESSAGES);
  }, []);
}

export function writeConversation(userId: string, messages: StoredMessage[]) {
  safe(() => {
    const trimmed = messages.slice(-MAX_STORED_MESSAGES).map(({ role, content, sources, actions, failed }) => ({
      role,
      content,
      sources,
      actions,
      failed,
    }));
    window.sessionStorage.setItem(conversationKey(userId), JSON.stringify(trimmed));
  }, undefined);
}

export function clearConversation(userId: string) {
  safe(() => window.sessionStorage.removeItem(conversationKey(userId)), undefined);
}
