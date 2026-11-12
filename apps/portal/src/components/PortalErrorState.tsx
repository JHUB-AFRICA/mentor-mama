import { Check, Info, MessageCircle, RefreshCw, Wrench } from "lucide-react";
import { Button } from "@mentormama/ui";
import { supportEmail } from "../lib/site";

type PortalErrorStateProps = {
  title?: string;
  message?: string;
  onRetry: () => void;
  supportHref?: string;
};

export function PortalErrorState({
  title = "We couldn’t load this page",
  message = "The information is temporarily unavailable. This might be due to a connection issue or scheduled maintenance.",
  onRetry,
  supportHref = `mailto:${supportEmail}?subject=MentorMAMA portal support`,
}: PortalErrorStateProps) {
  return (
    <div className="portal-error-state-stack">
      <section className="portal-error-state" role="alert" aria-live="polite">
        <div className="portal-error-illustration" aria-hidden="true">
          <span className="portal-error-cloud portal-error-cloud--one" />
          <span className="portal-error-cloud portal-error-cloud--two" />
          <span className="portal-error-document">
            <span />
            <span />
            <span />
          </span>
          <span className="portal-error-mark">!</span>
          <span className="portal-error-spark portal-error-spark--one" />
          <span className="portal-error-spark portal-error-spark--two" />
          <span className="portal-error-spark portal-error-spark--three" />
        </div>
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="portal-error-actions">
          <Button type="button" onClick={onRetry}>
            <RefreshCw size={17} aria-hidden="true" />
            Try again
          </Button>
          <Button variant="tertiary" to={supportHref}>
            <MessageCircle size={17} aria-hidden="true" />
            Contact support
          </Button>
        </div>
        <div className="portal-error-guidance">
          <div className="portal-error-guidance-heading">
            <Info size={18} aria-hidden="true" />
            <strong>What you can do</strong>
          </div>
          <ul>
            <li>
              <Check size={15} aria-hidden="true" />
              Check your internet connection
            </li>
            <li>
              <Check size={15} aria-hidden="true" />
              Try again in a few moments
            </li>
            <li>
              <Check size={15} aria-hidden="true" />
              Contact support if the problem persists
            </li>
          </ul>
        </div>
      </section>
      <aside className="portal-maintenance-note">
        <span className="portal-maintenance-note-icon" aria-hidden="true">
          <Wrench size={19} />
        </span>
        <div>
          <strong>Planned maintenance</strong>
          <p>
            We regularly perform updates to keep MentorMAMA running smoothly. If
            you continue to see this message, please check with your programme
            administrator.
          </p>
        </div>
      </aside>
    </div>
  );
}
