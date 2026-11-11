import { useEffect, useRef, useState } from "react";
import { Bell, Check, LoaderCircle, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ApiError, getNotifications, markAllNotificationsRead, markNotificationRead } from "../../services/api";
import type { NotificationItem } from "../../services/api";

const titles: Record<string, string> = {
  "account.invitation": "Your workspace invitation is ready",
  "account.password_reset": "Password reset requested",
  "account.email_verification": "Confirm your email address",
  "account.security": "Account security update",
  "placement.invitation": "A placement is ready to review",
  "placement.acknowledgement_reminder": "Placement acknowledgement is waiting",
  "placement.scheduled": "A placement is ready for student review",
  "placement.orientation_acknowledged": "A student is ready for induction",
  "placement.induction_completed": "Your placement induction is complete",
  "placement.mentor_assigned": "You have a new placement assignment",
  "placement.mentor_batch_assigned": "New students have been assigned to you",
  "placement.mentor_unavailable": "Some placements need a new mentor",
  "placement.arrangement_overridden": "A placement arrangement was changed by the coordinator",
  "placement.arranged": "Students have been arranged into wards",
  "placement.requested": "Students are waiting to be placed at your facility",
  "placement.mentor_reassigned": "A placement assignment changed",
  "placement.paused": "A placement has been paused",
  "placement.resumed": "A placement has resumed",
  "placement.withdrawn": "A placement was withdrawn",
  "placement.completed": "A placement is complete",
  "safeguarding.concern_raised": "A safeguarding concern needs review",
  "safeguarding.status_changed": "A safeguarding report has an update",
  "feedback.received": "Confidential feedback is ready for review",
  "mentorship.follow_up": "A mentor follow-up needs review",
  "assessment.final_submitted": "A placement is ready for close-out",
};

export function NotificationPopover() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePress(event: PointerEvent) {
      if (!popoverRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await getNotifications());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Notifications could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function read(item: NotificationItem) {
    if (!item.read_at) {
      try {
        const updated = await markNotificationRead(item.id);
        setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : "That notification could not be updated.");
        return;
      }
    }
    const placementId = item.payload.placement_id;
    if (typeof placementId === "string" && placementId) {
      const mentorPath = window.location.pathname.startsWith("/mentor");
      navigate(mentorPath
        ? `/mentor/students/${placementId}${item.template_key.startsWith("safeguarding") ? "?tab=safeguarding" : ""}`
        : `/placements/${placementId}`);
      setOpen(false);
    }
  }

  async function markAllRead() {
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => item.read_at ? item : { ...item, read_at: now }));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Notifications could not be updated.");
    }
  }

  const unread = items.filter((item) => !item.read_at).length;
  return (
    <div ref={popoverRef} className="relative">
      <button type="button" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-navy-muted transition hover:bg-mist hover:text-teal focus:outline-none focus:ring-2 focus:ring-teal" onClick={() => setOpen((value) => !value)}>
        <Bell size={19} />
        {unread > 0 && <span aria-hidden="true" className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal px-1 font-body text-[9px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && <>
        <button type="button" aria-label="Close notifications" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
        <section role="dialog" aria-label="Notifications" className="fixed left-2 right-2 top-[4.75rem] z-40 max-h-[calc(100dvh-5.5rem)] w-auto overflow-hidden rounded-2xl border border-border bg-white shadow-[0_18px_50px_rgba(13,27,51,0.16)] sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+0.7rem)] sm:max-h-none sm:w-[min(24rem,calc(100vw-2rem))]">
          <div className="flex items-center justify-between border-b border-border px-4 py-4"><div><p className="font-body text-[0.68rem] font-bold uppercase tracking-[0.14em] text-teal">Inbox</p><h2 className="mt-1 font-display text-lg font-bold text-navy">Notifications</h2></div><div className="flex items-center gap-1"><button type="button" className="rounded-lg px-2 py-1 font-body text-[0.68rem] font-bold text-teal hover:bg-mist disabled:cursor-not-allowed disabled:opacity-40" onClick={() => void markAllRead()} disabled={!unread}>Mark all read</button><button type="button" aria-label="Close notifications" className="rounded-lg p-2 text-navy-muted hover:bg-mist" onClick={() => setOpen(false)}><X size={17} /></button></div></div>
          {error && <p role="alert" className="border-b border-error/20 bg-error/5 px-4 py-3 font-body text-xs leading-5 text-error">{error}</p>}
          <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto p-2 sm:max-h-[26rem]">
            {loading ? <div className="flex items-center gap-2 px-3 py-8 font-body text-sm text-navy-muted"><LoaderCircle size={17} className="animate-spin text-teal" />Loading notifications…</div> : items.length === 0 ? <div className="px-3 py-8 text-center"><Check size={20} className="mx-auto text-teal" /><p className="mt-3 font-body text-sm font-semibold text-navy">You’re all caught up</p><p className="mt-1 font-body text-xs text-navy-muted">Important updates will appear here.</p></div> : items.map((item) => <button type="button" key={item.id} onClick={() => void read(item)} className={`block w-full rounded-xl px-3 py-3 text-left transition hover:bg-mist ${item.read_at ? "" : "bg-teal-light/35"}`}><div className="flex items-start gap-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.read_at ? "bg-border" : "bg-teal"}`} /><span className="min-w-0 flex-1"><span className="block font-body text-sm font-semibold text-navy">{titles[item.template_key] ?? "Programme update"}</span><span className="mt-1 block font-body text-xs leading-5 text-navy-muted">{item.template_key.startsWith("safeguarding") ? "Open the restricted workspace to review this safely." : "Open MentorMAMA to review the latest update."}</span><span className="mt-2 block font-body text-[0.68rem] text-navy-muted">{new Date(item.created_at).toLocaleString("en-GB")}</span></span></div></button>)}
          </div>
        </section>
      </>}
    </div>
  );
}
