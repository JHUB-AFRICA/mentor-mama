import { Link } from "react-router-dom";
import { Twitter, Instagram, Linkedin, Mail, MapPin } from "lucide-react";
import Logo from "./Logo";

const socialLinks = [
  { icon: Twitter, href: "#", label: "Twitter" },
  { icon: Instagram, href: "#", label: "Instagram" },
  { icon: Linkedin, href: "#", label: "LinkedIn" },
];

export default function Footer() {
  return (
    <footer className="bg-navy text-white/60 border-t border-white/5">
      <div className="content-max-width container-padding py-20 lg:py-24">
        {/* Main Footer Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-16">
          
          {/* Column 1: Logo & Mission Statement */}
          <div className="space-y-6">
            <Link to="/" className="inline-block">
              <Logo lockup="stacked" tone="white" height={92} showTagline />
            </Link>
            <p className="text-[13px] text-white/40 leading-relaxed max-w-[240px]">
              A digital clinical mentorship toolkit supporting midwives and nursing students for safer maternity care placement.
            </p>
            {/* Social Links nested here under the description */}
            <div className="flex items-center gap-4 pt-2">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-sage hover:border-sage transition-all duration-300"
                >
                  <social.icon size={14} className="stroke-[1.75]" />
                </a>
              ))}
            </div>
          </div>

          {/* Column 2: Platform Links */}
          <div className="space-y-5">
            <h4 className="text-[11px] font-semibold text-white uppercase tracking-wider relative after:content-[''] after:inline-block after:w-1 after:h-1 after:bg-sage after:rounded-full after:ml-1.5">
              Platform
            </h4>
            <ul className="space-y-3">
              <li>
                <Link to="/about" className="text-[13px] text-white/50 hover:text-white transition-colors duration-200">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/how-it-works" className="text-[13px] text-white/50 hover:text-white transition-colors duration-200">
                  How It Works
                </Link>
              </li>
              <li>
                <Link to="/resources" className="text-[13px] text-white/50 hover:text-white transition-colors duration-200">
                  Resources Library
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Collaboration & Partners */}
          <div className="space-y-5">
            <h4 className="text-[11px] font-semibold text-white uppercase tracking-wider relative after:content-[''] after:inline-block after:w-1 after:h-1 after:bg-sage after:rounded-full after:ml-1.5">
              Program Partners
            </h4>
            <ul className="space-y-3">
              <li className="text-[13px] text-white/40">
                JKUAT School of Nursing
              </li>
              <li className="text-[13px] text-white/40">
                JHUB Africa
              </li>
              <li className="text-[13px] text-white/40">
                AfyaVentures
              </li>
            </ul>
          </div>

          {/* Column 4: Contact Information */}
          <div className="space-y-5">
            <h4 className="text-[11px] font-semibold text-white uppercase tracking-wider relative after:content-[''] after:inline-block after:w-1 after:h-1 after:bg-sage after:rounded-full after:ml-1.5">
              Contact
            </h4>
            <ul className="space-y-3">
              <li>
                <a 
                  href="mailto:info@mentormama.com" 
                  className="text-[13px] text-white/50 hover:text-white transition-colors duration-200 flex items-center gap-2 group"
                >
                  <Mail size={14} className="text-sage group-hover:scale-105 transition-transform" />
                  info@mentormama.com
                </a>
              </li>
              <li className="text-[13px] text-white/50 flex items-center gap-2">
                <MapPin size={14} className="text-sage" />
                Nairobi, Kenya
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar: Copyright & Developer Info */}
        <div className="mt-16 pt-8 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4 text-center sm:text-left">
          <p className="text-[12px] text-white/30">
            &copy; 2026 MentorMAMA. All rights reserved.
          </p>
          <p className="text-[12px] text-white/30">
            Built by <span className="text-white/50">Sinaps Technology</span>.
          </p>
        </div>
      </div>
    </footer>
  );
}
