import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import Logo from "./Logo";

const navLinks = [
  { label: "About", href: "/about" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Resources", href: "/resources" },
  { label: "Community", href: "/community" },
  { label: "Contact", href: "/contact" },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isActive = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname === href;
  };



  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-white/95 backdrop-blur-md border-b border-cream-dark/20 shadow-sm"
      >
        <div className="content-max-width container-padding flex items-center justify-between h-18 lg:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center group">
            <Logo variant="light" size={28} />
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-9">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`text-[14px] font-medium tracking-[0.02em] transition-colors relative ${
                  isActive(link.href)
                    ? "text-sage"
                    : "text-charcoal hover:text-sage"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden lg:flex items-center">
            <Link
              to="/contact"
              className="bg-sage text-white px-6 py-2.5 rounded-pill text-[14px] font-semibold hover:bg-sage/90 transition-all hover:scale-[1.02]"
            >
              Request Pilot Access
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 text-navy"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-cream transition-all duration-500 lg:hidden ${
          mobileOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex flex-col items-center justify-center h-full gap-6 pt-20">
          {navLinks.map((link, i) => (
            <Link
              key={link.href}
              to={link.href}
              className={`font-display text-h2 transition-all duration-500 ${
                isActive(link.href) ? "text-sage" : "text-navy"
              }`}
              style={{
                transitionDelay: mobileOpen ? `${i * 60}ms` : "0ms",
                opacity: mobileOpen ? 1 : 0,
                transform: mobileOpen ? "translateY(0)" : "translateY(16px)",
              }}
            >
              {link.label}
            </Link>
          ))}
          <div
            className="flex flex-col items-center gap-5 mt-6"
            style={{
              transitionDelay: mobileOpen ? "360ms" : "0ms",
              opacity: mobileOpen ? 1 : 0,
              transform: mobileOpen ? "translateY(0)" : "translateY(16px)",
              transition: "all 0.5s ease",
            }}
          >
            <Link
              to="/contact"
              className="bg-sage text-white px-8 py-3 rounded-pill text-body font-semibold hover:bg-sage/90 transition-colors"
            >
              Request Pilot Access
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
