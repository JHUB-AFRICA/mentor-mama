import { CircleHelp, Mail, ShieldCheck } from "lucide-react";
import { Button, Card } from "@mentormama/ui";

export function SupportPanel({ onBack }: { onBack: () => void }) {
  return (
    <section aria-label="Support" className="max-w-4xl">
      <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">Programme support</p>
      <h2 className="mt-2 font-display text-4xl font-bold tracking-tight text-navy">A clear path when you need help.</h2>
      <p className="mt-3 max-w-2xl font-body text-base leading-7 text-navy-muted">
        Your programme team manages invitations, roles, and access. Use the guidance below before asking an administrator to intervene.
      </p>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        <Card padding="md"><CircleHelp className="text-teal" size={21} /><h3 className="mt-4 font-display text-lg font-bold text-navy">Account access</h3><p className="mt-2 font-body text-sm leading-6 text-navy-muted">Use password recovery for a forgotten password, or ask a Programme Admin to resend an invitation.</p></Card>
        <Card padding="md"><ShieldCheck className="text-teal" size={21} /><h3 className="mt-4 font-display text-lg font-bold text-navy">Authenticator lost?</h3><p className="mt-2 font-body text-sm leading-6 text-navy-muted">Open Account settings and submit an MFA recovery request. Access is restored only after review.</p></Card>
        <Card padding="md"><Mail className="text-teal" size={21} /><h3 className="mt-4 font-display text-lg font-bold text-navy">Programme contact</h3><p className="mt-2 font-body text-sm leading-6 text-navy-muted">Contact your university coordinator or programme administrator for role and placement support.</p></Card>
      </div>
      <Button variant="tertiary" size="sm" className="mt-8" onClick={onBack}>Back to overview</Button>
    </section>
  );
}
