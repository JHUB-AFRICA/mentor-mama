import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCircle2,
  History,
  KeyRound,
  LifeBuoy,
  LockKeyhole,
  ShieldAlert,
  UserRound,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { CurrentUser } from "../../services/api";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, IconTile, ListRow, Notice } from "../programme-admin/ui/AdminKit";
import { MentorWorkspaceFrame } from "./MentorWorkspaceFrame";
import "./mentor-more.css";

const TIPS = [
  "Record the learning focus, not patient-identifiable details.",
  "Use follow-up to make the next action explicit.",
  "Sessions saved offline stay visible until they sync.",
  "Raise a private concern when wellbeing or safety needs attention.",
];

/** Mentor "More": account shortcuts, connection status, good-practice reminders and safeguarding. */
export function MentorMore({ user }: { user: CurrentUser }) {
  const navigate = useNavigate();
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <MentorWorkspaceFrame user={user} title="More" active="more">
      <div className="mentor-page-container">
        <AdminPage className="mm">
          <AdminPageHeader
            eyebrow="Mentor workspace"
            title="More"
            description="Your account, activity, good-practice reminders and safeguarding, in one place."
            meta={
              <span className={`mm-status ${online ? "is-online" : "is-offline"}`} role="status">
                {online ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
                {online ? "Online · records sync as you save" : "Offline · saved sessions sync when you reconnect"}
              </span>
            }
          />

          <div className="mm-grid">
            <AdminCard title="Account & preferences" description="Your profile, notifications and sign-in security." flush>
              <ListRow icon={<History />} tone="teal" title="Activity" meta="What you and your students have done" onClick={() => navigate("/mentor?view=activity")} />
              <ListRow icon={<UserRound />} tone="blue" title="Profile" meta="Your name, contact and mentor details" onClick={() => navigate("/account?tab=profile")} />
              <ListRow icon={<Bell />} tone="violet" title="Notifications" meta="Choose which emails you receive" onClick={() => navigate("/account?tab=notifications")} />
              <ListRow icon={<LockKeyhole />} tone="slate" title="Security" meta="Password and two-step sign-in" onClick={() => navigate("/account?tab=security")} />
            </AdminCard>

            <div className="mm-stack">
              <AdminCard title="Mentor practice" description="Reminders for reliable, safe mentorship records.">
                <ul className="mm-tips">
                  {TIPS.map((tip) => (
                    <li key={tip}>
                      <CheckCircle2 aria-hidden="true" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </AdminCard>

              <section className="mm-safeguarding" aria-labelledby="mm-safeguarding-title">
                <IconTile tone="amber" icon={<ShieldAlert />} />
                <div className="mm-safeguarding__copy">
                  <h3 id="mm-safeguarding-title">Safeguarding & support</h3>
                  <p>To raise a private concern, open the student&rsquo;s record and choose who should look into it: the nurse manager, the coordinator, or both.</p>
                </div>
                <div className="mm-safeguarding__actions">
                  <AdminButton size="sm" icon={<Users />} onClick={() => navigate("/mentor?view=students")}>Open a student record</AdminButton>
                  <AdminButton size="sm" variant="secondary" icon={<KeyRound />} onClick={() => navigate("/account?tab=recovery")}>Account help</AdminButton>
                </div>
              </section>
            </div>
          </div>

          <Notice icon={<LifeBuoy />}>
            For a risk to someone&rsquo;s safety right now, follow your facility protocol and speak to a senior clinician straight away.
          </Notice>
        </AdminPage>
      </div>
    </MentorWorkspaceFrame>
  );
}
