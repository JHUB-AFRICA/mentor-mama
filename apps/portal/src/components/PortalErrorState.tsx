import { useEffect, useRef, useState } from "react";
import { CloudOff, RefreshCw, WifiOff } from "lucide-react";
import { supportEmail } from "../lib/site";

type PortalErrorStateProps = {
  title?: string;
  message?: string;
  onRetry: () => void;
  supportHref?: string;
};

/** Browsers report this reliably when there is no connection at all. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

/**
 * Shown when a screen cannot load. Deliberately small and calm: what happened, one clear action, one quiet way to get help.
 * If the device is offline it says so, and it tries again by itself the moment the connection returns.
 */
export function PortalErrorState({
  title,
  message,
  onRetry,
  supportHref = `mailto:${supportEmail}?subject=MentorMAMA portal support`,
}: PortalErrorStateProps) {
  const online = useOnline();
  const [retrying, setRetrying] = useState(false);
  const wasOffline = useRef(!online);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function retry() {
    setRetrying(true);
    onRetry();
    // The screen swaps this card out when the request succeeds; if it fails again, stop the spinner.
    timer.current = window.setTimeout(() => setRetrying(false), 1200);
  }

  // Coming back online after being offline: try once without making the person press anything.
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      retry();
    }
  }, [online]);

  const Icon = online ? CloudOff : WifiOff;
  const heading = title ?? (online ? "We couldn’t load this page" : "You appear to be offline");
  const body =
    message ??
    (online
      ? "Something on our side is taking a moment. Your work is safe. Please try again."
      : "Check your connection. This page will reload by itself as soon as you are back online.");

  return (
    <div className="portal-error-state-stack">
      <section className="portal-error-state" role="alert" aria-live="polite">
        <span className={`portal-error-icon${online ? "" : " portal-error-icon--offline"}`} aria-hidden="true">
          <Icon size={30} strokeWidth={1.6} />
        </span>
        <h2>{heading}</h2>
        <p>{body}</p>
        <div className="portal-error-actions">
          <button type="button" className="portal-error-retry" onClick={retry} disabled={retrying} aria-busy={retrying}>
            <RefreshCw size={16} aria-hidden="true" className={retrying ? "is-spinning" : undefined} />
            {retrying ? "Trying…" : "Try again"}
          </button>
          <a className="portal-error-help" href={supportHref}>
            Contact support
          </a>
        </div>
        <p className="portal-error-hint">If this keeps happening, tell us what you were doing and we will look into it.</p>
      </section>
    </div>
  );
}
