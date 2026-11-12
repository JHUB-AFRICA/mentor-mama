import { Link, useSearchParams } from "react-router-dom";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { Mail, MapPin, LifeBuoy } from "lucide-react";
import { contactEmail } from "../lib/site";
import EnquiryForm from "../components/EnquiryForm";

export default function Contact() {
  const ref = useScrollReveal<HTMLDivElement>();
  const [params, setParams] = useSearchParams();
  const kind = params.get("type") === "pilot" ? "pilot" : "contact";

  return (
    <section className="relative min-h-[85vh] flex items-center bg-cream/30 pt-28 pb-16">
      <div ref={ref} className="content-max-width container-padding w-full">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start mt-8">
          
          {/* Left: Contact Info */}
          <div className="lg:col-span-5 space-y-8 animate-fade-in" data-reveal>
            <div>
              <span className="text-overline text-sage">Contact Us</span>
              <h1 className="text-h1 text-navy mt-3">
                Let's start a conversation
              </h1>
              <p className="mt-6 text-body-large text-charcoal-muted">
                Have questions about MentorMAMA, interested in piloting the platform at your facility, or want to collaborate? Get in touch with our team.
              </p>
            </div>

            <div className="space-y-6 pt-6 border-t border-cream-dark/50">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-refined bg-sage/10 flex items-center justify-center flex-shrink-0 text-sage mt-1">
                  <Mail size={18} className="stroke-[1.5]" />
                </div>
                <div>
                  <h4 className="text-[14px] font-semibold text-navy">Email Us</h4>
                  <p className="text-body-small text-charcoal-muted mt-1">
                    {contactEmail}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-refined bg-sage/10 flex items-center justify-center flex-shrink-0 text-sage mt-1">
                  <MapPin size={18} className="stroke-[1.5]" />
                </div>
                <div>
                  <h4 className="text-[14px] font-semibold text-navy">Location</h4>
                  <p className="text-body-small text-charcoal-muted mt-1">
                    Nairobi, Kenya
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-sage/5 border border-sage/15 rounded-refined p-6">
              <p className="text-body-small text-sage font-medium">
                Looking to request pilot access?
              </p>
              <p className="text-body-small text-charcoal-muted mt-2">
                Choose “Request pilot access” and share your maternity unit’s mentors and cohort size so we can prepare your setup.
              </p>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-refined bg-sage/10 flex items-center justify-center flex-shrink-0 text-sage mt-1">
                <LifeBuoy size={18} className="stroke-[1.5]" />
              </div>
              <div>
                <h4 className="text-[14px] font-semibold text-navy">Already using MentorMAMA?</h4>
                <p className="text-body-small text-charcoal-muted mt-1">
                  Locked out or something not working? <Link to="/support" className="text-sage font-semibold hover:underline">Get support</Link>.
                </p>
              </div>
            </div>
          </div>

          {/* Right: Contact Form */}
          <div className="lg:col-span-7 bg-white border border-cream-dark/60 rounded-refined p-8 md:p-10 shadow-editorial" data-reveal>
            <div role="tablist" aria-label="What would you like to do?" className="flex gap-2 p-1 mb-8 rounded-pill bg-cream/60">
              {([
                ["contact", "Send a message"],
                ["pilot", "Request pilot access"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  role="tab"
                  type="button"
                  id={`tab-${value}`}
                  aria-selected={kind === value}
                  aria-controls="enquiry-panel"
                  onClick={() => setParams(value === "pilot" ? { type: "pilot" } : {}, { replace: true })}
                  className={`flex-1 px-4 py-2.5 rounded-pill text-[13px] font-semibold transition-colors ${
                    kind === value ? "bg-white text-navy shadow-editorial" : "text-charcoal-muted hover:text-navy"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div id="enquiry-panel" role="tabpanel" aria-labelledby={`tab-${kind}`}>
              <EnquiryForm key={kind} kind={kind} sourcePage={`/contact${kind === "pilot" ? "?type=pilot" : ""}`} />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
