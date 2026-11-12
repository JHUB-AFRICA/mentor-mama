import { Link } from "react-router-dom";
import { contactEmail } from "../lib/site";

const UPDATED = "12 November 2026";

const sections: Array<{ id: string; title: string; body: React.ReactNode }> = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <p>
        MentorMAMA is a digital clinical mentorship toolkit for maternity units, built and operated by Sinaps Technology with our programme partners. This notice
        explains what we do with the details you give us on this website. If you use the signed-in MentorMAMA portal, your programme administrator explains how
        your programme uses your data.
      </p>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <>
        <p>When you use the contact, pilot access or support forms we collect only what you type:</p>
        <ul>
          <li>your name, email address and, if you choose, phone number, organisation and role;</li>
          <li>your message, and for pilot requests the details about your unit and cohort you share;</li>
          <li>the time you agreed to be contacted, the page you sent it from and your browser type (to deal with abuse and fix problems).</li>
        </ul>
        <p>Please do not put patient information, passwords or sign-in codes in any form. We will never ask for them.</p>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use it",
    body: (
      <>
        <p>We use these details to reply to you, to assess pilot requests, to help you with account problems, and to keep the forms safe from spam. We email you a confirmation with a reference number and updates as we work on your request.</p>
        <p>We do not sell your details, use them for advertising, or send newsletters unless you ask for them.</p>
      </>
    ),
  },
  {
    id: "share",
    title: "Who can see it",
    body: (
      <p>
        Only MentorMAMA platform administrators can read your message. We use trusted service providers to run the website, store data and send email on our behalf
        (for example our hosting, file storage and email delivery providers). They process your data only to provide those services.
      </p>
    ),
  },
  {
    id: "keep",
    title: "How long we keep it",
    body: (
      <ul>
        <li>Open requests: until they are resolved.</li>
        <li>Resolved or closed requests: 24 months, then deleted.</li>
        <li>Messages we identify as spam: 30 days, then deleted.</li>
      </ul>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <p>
        Under the Kenya Data Protection Act, 2019 you can ask to see the details we hold about you, correct them, object to how we use them, or ask us to delete them.
        Email <a href={`mailto:${contactEmail}`}>{contactEmail}</a> and quote your reference number. You can also complain to the Office of the Data Protection
        Commissioner.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: <p>This website does not use advertising or tracking cookies. The forms do not set cookies.</p>,
  },
  {
    id: "changes",
    title: "Changes",
    body: <p>If we change this notice we will update the date below. Material changes will be announced on this page.</p>,
  },
];

export default function Privacy() {
  return (
    <section className="bg-cream/30 pt-32 pb-20">
      <div className="content-max-width container-padding">
        <div className="grid lg:grid-cols-12 gap-12">
          <header className="lg:col-span-4">
            <span className="text-overline text-sage">Legal</span>
            <h1 className="text-h1 text-navy mt-3">Privacy notice</h1>
            <p className="mt-5 text-body text-charcoal-muted">How MentorMAMA handles the details you send through this website.</p>
            <p className="mt-2 text-body-small text-charcoal-muted">Last updated {UPDATED}</p>
            <nav aria-label="On this page" className="mt-8 hidden lg:block">
              <ul className="space-y-2 border-l border-cream-dark pl-4">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className="text-body-small text-charcoal-muted hover:text-sage transition-colors">
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </header>
          <article className="lg:col-span-8 bg-white border border-cream-dark/60 rounded-refined p-8 md:p-10 shadow-editorial privacy-prose">
            {sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-28">
                <h2>{section.title}</h2>
                {section.body}
              </section>
            ))}
            <p className="mt-10 pt-6 border-t border-cream-dark/60 text-body-small text-charcoal-muted">
              Questions? <Link to="/contact" className="text-sage font-semibold hover:underline">Contact us</Link> or email{" "}
              <a href={`mailto:${contactEmail}`} className="text-sage font-semibold hover:underline">{contactEmail}</a>.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
