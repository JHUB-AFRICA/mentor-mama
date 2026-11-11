import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bell,
  CircleUserRound,
  LockKeyhole,
  MessageSquareText,
  ShieldAlert,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@mentormama/ui";
import type { CurrentUser, Placement } from "../../services/api";
import "./StudentPlacementDetail.css";

export function StudentMore({
  user,
  placements,
}: {
  user: CurrentUser;
  placements: Placement[];
}) {
  const [selectedPlacementId, setSelectedPlacementId] = useState(placements[0]?.id ?? "");
  useEffect(() => {
    if (placements.length && !placements.some(({ id }) => id === selectedPlacementId)) {
      setSelectedPlacementId(placements[0].id);
    }
  }, [placements, selectedPlacementId]);
  const selectedPlacement = placements.find(({ id }) => id === selectedPlacementId);
  const placementTarget = selectedPlacement
    ? `/student/placements/${selectedPlacement.id}`
    : "/student?view=placements";

  return (
    <div className="student-page-container student-more-page">
      <section className="student-more-header">
        <div>
          <p className="student-kicker">Student support</p>

          <h1>Support & account</h1>

          <p>
            Manage the parts of your MentorMAMA experience that sit outside
            your daily placement work.
          </p>
        </div>
      </section>

      <section className="student-more-section">
        <div className="student-more-section__heading">
          <div>
            <p className="student-kicker">Placement support</p>
            <h2>When you need help</h2>
          </div>

          <p>
            Feedback and safeguarding tools are connected to your placement
            record.
          </p>
        </div>

        <Link to="/student?view=activity" className="student-more-action" style={{ marginBottom: 16, display: "inline-flex" }}>
          View your activity <ArrowRight size={16} />
        </Link>

        {placements.length > 1 && (
          <label className="student-more-placement-picker">
            <span>Placement</span>
            <select value={selectedPlacementId} onChange={(event) => setSelectedPlacementId(event.target.value)}>
              {placements.map((placement) => (
                <option key={placement.id} value={placement.id}>
                  {placement.facility_name ?? "Placement record"}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="student-more-support-grid">
          <Card className="student-more-support-card">
            <div className="student-more-support-card__top">
              <span className="student-more-icon student-more-icon--teal">
                <MessageSquareText size={20} />
              </span>

              <span className="student-more-label">Placement wellbeing</span>
            </div>

            <div className="student-more-support-card__content">
              <h3>Feedback & confidence</h3>

              <p>
                Tell us how your placement is going and record your confidence
                as you progress through the experience.
              </p>
            </div>

            <Link
              to={
                selectedPlacement
                  ? `${placementTarget}#feedback`
                  : placementTarget
              }
              className="student-more-action"
            >
              {selectedPlacement ? "Open feedback" : "Choose a placement"}
              <ArrowRight size={16} />
            </Link>
          </Card>

          <Card className="student-more-support-card student-more-support-card--safeguarding">
            <div className="student-more-support-card__top">
              <span className="student-more-icon student-more-icon--warning">
                <ShieldAlert size={20} />
              </span>

              <span className="student-more-label">
                Confidential support
              </span>
            </div>

            <div className="student-more-support-card__content">
              <h3>Raise a concern</h3>

              <p>
                Report a wellbeing, safety, safeguarding, or professional
                concern to the reviewers you choose, and follow its progress.
              </p>
            </div>

            <Link to="/student?view=concerns" className="student-more-action">
              Open my concerns
              <ArrowRight size={16} />
            </Link>
          </Card>
        </div>
      </section>

      <section className="student-more-section">
        <div className="student-more-section__heading">
          <div>
            <p className="student-kicker">Your account</p>
            <h2>Personal settings</h2>
          </div>

          <p>
            Keep your student information and communication preferences up to
            date.
          </p>
        </div>

        <Card className="student-more-account-list">
          <AccountRow
            icon={<CircleUserRound size={19} />}
            title="Profile & student details"
            description="Programme information and emergency contact details."
            action="Manage profile"
            to="/student/profile"
          />

          <AccountRow
            icon={<LockKeyhole size={19} />}
            title="Security"
            description="Password, active sessions, and MFA recovery options."
            action="Manage security"
            to="/account?tab=security"
          />

          <AccountRow
            icon={<Bell size={19} />}
            title="Notifications"
            description="Choose how you receive important programme updates."
            action="Notification preferences"
            to="/account?tab=notifications"
          />
        </Card>
      </section>

      <section className="student-more-account-context">
        <div>
          <span className="student-more-account-context__label">
            Signed in account
          </span>

          <strong>{user.email}</strong>
        </div>

      </section>
    </div>
  );
}

function AccountRow({
  icon,
  title,
  description,
  action,
  to,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: string;
  to: string;
}) {
  return (
    <Link to={to} className="student-more-account-row">
      <span className="student-more-account-row__icon">{icon}</span>

      <span className="student-more-account-row__content">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>

      <span className="student-more-account-row__action">
        {action}
        <ArrowRight size={16} />
      </span>
    </Link>
  );
}
