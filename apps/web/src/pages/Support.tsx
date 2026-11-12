import { Link } from "react-router-dom";
import { Clock, KeyRound, ShieldCheck } from "lucide-react";
import { useScrollReveal } from "../hooks/useScrollReveal";
import EnquiryForm from "../components/EnquiryForm";

export default function Support() {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <section className="relative min-h-[85vh] flex items-center bg-cream/30 pt-28 pb-16">
      <div ref={ref} className="content-max-width container-padding w-full">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start mt-8">
          <div className="lg:col-span-5 space-y-8 animate-fade-in" data-reveal>
            <div>
              <span className="text-overline text-sage">Support</span>
              <h1 className="text-h1 text-navy mt-3">We’re here to help</h1>
              <p className="mt-6 text-body-large text-charcoal-muted">
                Can’t sign in, lost your authenticator, or something isn’t working? Tell us what happened and the MentorMAMA team will get back to you.
              </p>
            </div>
            <ul className="space-y-6 pt-6 border-t border-cream-dark/50">
              {[
                { icon: Clock, title: "A reply within 2 working days", text: "You get a confirmation with a reference straight away, and an email whenever there is progress." },
                { icon: KeyRound, title: "Lost your authenticator?", text: "Use “Need help signing in?” on the sign-in page. Your programme administrator can usually sort it out faster." },
                { icon: ShieldCheck, title: "Keep your details safe", text: "Never send your password or a sign-in code. We will never ask for them." },
              ].map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-refined bg-sage/10 flex items-center justify-center flex-shrink-0 text-sage mt-1">
                    <Icon size={18} className="stroke-[1.5]" />
                  </div>
                  <div>
                    <h2 className="text-[14px] font-semibold text-navy">{title}</h2>
                    <p className="text-body-small text-charcoal-muted mt-1">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-body-small text-charcoal-muted">
              Not a support question? <Link to="/contact" className="text-sage font-semibold hover:underline">Contact us</Link>.
            </p>
          </div>
          <div className="lg:col-span-7 bg-white border border-cream-dark/60 rounded-refined p-8 md:p-10 shadow-editorial" data-reveal>
            <EnquiryForm kind="support" sourcePage="/support" />
          </div>
        </div>
      </div>
    </section>
  );
}
