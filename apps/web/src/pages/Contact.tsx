import { useState } from "react";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { Mail, MapPin, Send, CheckCircle2 } from "lucide-react";

export default function Contact() {
  const ref = useScrollReveal<HTMLDivElement>();
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    institution: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate submission
    setSubmitted(true);
  };

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
                    info@mentormama.org
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
                Use the form to share details about your maternity unit cohort size (mentors and students) so we can prepare your facility setup.
              </p>
            </div>
          </div>

          {/* Right: Contact Form */}
          <div className="lg:col-span-7 bg-white border border-cream-dark/60 rounded-refined p-8 md:p-10 shadow-editorial" data-reveal>
            {submitted ? (
              <div className="text-center py-12 space-y-4">
                <div className="w-14 h-14 rounded-full bg-sage/15 flex items-center justify-center text-sage mx-auto">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="text-h3 text-navy">Thank You!</h3>
                <p className="text-body text-charcoal-muted max-w-sm mx-auto">
                  Your message has been sent successfully. A member of the MentorMAMA team will get back to you shortly.
                </p>
                <button
                  onClick={() => setSubmitted(false)}
                  className="mt-6 px-6 py-2.5 rounded-pill bg-cream text-navy text-[14px] font-semibold hover:bg-cream-dark/50 transition-colors"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-[13px] font-semibold text-navy mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter your name"
                    className="w-full px-5 py-3 rounded-pill bg-cream/50 border border-cream-dark/50 text-navy placeholder:text-charcoal-muted/50 text-body-small focus:outline-none focus:ring-2 focus:ring-sage/30 transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-[13px] font-semibold text-navy mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="name@institution.org"
                    className="w-full px-5 py-3 rounded-pill bg-cream/50 border border-cream-dark/50 text-navy placeholder:text-charcoal-muted/50 text-body-small focus:outline-none focus:ring-2 focus:ring-sage/30 transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="institution" className="block text-[13px] font-semibold text-navy mb-2">
                    Institution <span className="text-charcoal-muted/40 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    id="institution"
                    value={formData.institution}
                    onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                    placeholder="e.g. JKUAT, Kenyatta National Hospital"
                    className="w-full px-5 py-3 rounded-pill bg-cream/50 border border-cream-dark/50 text-navy placeholder:text-charcoal-muted/50 text-body-small focus:outline-none focus:ring-2 focus:ring-sage/30 transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="message" className="block text-[13px] font-semibold text-navy mb-2">
                    Message
                  </label>
                  <textarea
                    id="message"
                    required
                    rows={5}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="How can we help you?"
                    className="w-full px-5 py-4 rounded-refined bg-cream/50 border border-cream-dark/50 text-navy placeholder:text-charcoal-muted/50 text-body-small focus:outline-none focus:ring-2 focus:ring-sage/30 transition-all resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full px-8 py-3.5 rounded-pill bg-sage text-white font-semibold text-body-small hover:bg-sage/90 transition-colors flex items-center justify-center gap-2 group"
                >
                  Send Message
                  <Send size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              </form>
            )}
          </div>
          
        </div>
      </div>
    </section>
  );
}
