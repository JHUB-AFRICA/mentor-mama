import type { ReactNode } from "react";
import {
  ArrowLeft,
  BookOpen,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import journeyArtwork from "../../assets/auth/mentor-mama-journey.png";

/*
 * Change this path if your logo asset is stored elsewhere.
 *
 * Prefer the real MentorMAMA symbol here instead of a generic
 * Lucide icon so the authentication experience remains
 * unmistakably part of the brand.
 */
import logoIcon from "../../assets/brand/logo-icon.svg";
import { Link } from "react-router-dom";

export function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-mist">
      <div
        className="
          mx-auto
          grid
          min-h-screen
          max-w-[1440px]
          lg:grid-cols-[minmax(340px,0.86fr)_minmax(560px,1.14fr)]
        "
      >
        {/* =====================================================
            BRAND PANEL
        ====================================================== */}
        <aside
          className="
            auth-brand-panel
            relative
            hidden
            min-h-screen
            overflow-hidden
            bg-navy
            px-12 py-12
            text-white
            lg:flex
            lg:flex-col
            xl:px-16
            2xl:px-20
          "
        >
          {/* Very subtle upper glow */}
          <div
            className="
              pointer-events-none
              absolute
              -left-40
              -top-40
              h-[30rem]
              w-[30rem]
              rounded-full
              bg-teal/[0.055]
              blur-3xl
            "
            aria-hidden="true"
          />

          {/* Journey illustration */}
          <img
            src={journeyArtwork}
            alt=""
            onError={(event) => {
              // Keep the branded panel intact if a cached/stale bundle cannot
              // resolve its optional decorative artwork.
              event.currentTarget.style.display = "none";
            }}
            className="
              auth-brand-artwork
              pointer-events-none
              absolute
              inset-x-0
              bottom-0
              h-[51%]
              w-full
              object-cover
              object-[55%_center]
              opacity-95
            "
            aria-hidden="true"
          />

          {/* Blend artwork into panel */}
          <div
            className="
              auth-brand-artwork-fade
              pointer-events-none
              absolute
              inset-x-0
              bottom-[37%]
              h-40
              bg-gradient-to-b
              from-navy
              via-navy/90
              to-transparent
            "
            aria-hidden="true"
          />

          <div className="auth-brand-artwork-shade" aria-hidden="true" />

          {/* =====================================================
              LOGO
          ====================================================== */}
          <div className="relative z-10">
            <Link
              to="/"
              className="
                inline-flex
                items-center
                gap-3
                text-white
                no-underline
              "
            >
              <img
                src={logoIcon}
                alt=""
                className="h-10 w-10 object-contain"
                aria-hidden="true"
              />

              <span
                className="
                  font-display
                  text-lg
                  font-bold
                  tracking-[-0.025em]
                "
              >
                MentorMAMA
              </span>
            </Link>

            {/* Brand statement */}
            <div className="auth-brand-message mt-20 xl:mt-24">
              <p
                className="
                  auth-brand-statement
                  max-w-[25rem]
                  font-display
                  text-[2rem]
                  font-semibold
                  leading-[1.18]
                  tracking-[-0.025em]
                  text-white
                  xl:text-[2.55rem]
                "
              >
                A calmer way to support better clinical{" "}
                <span className="text-teal">mentorship.</span>
              </p>

              <div
                className="
                  mt-7
                  h-[3px]
                  w-14
                  rounded-full
                  bg-teal
                "
                aria-hidden="true"
              />

              <p
                className="
                  auth-brand-description
                  mt-5
                  max-w-[24rem]
                  font-body
                  text-sm
                  leading-7
                  text-white/62
                "
              >
                Your programme workspace keeps the next useful
                action close and the important details clear.
              </p>
            </div>
          </div>

          {/* Spacer pushes benefits toward lower area */}
          <div className="relative z-10 flex-1" />

          {/* =====================================================
              BENEFITS
          ====================================================== */}
          <div
            className="
              auth-brand-benefits
              relative
              z-10
              mb-12
              grid
              grid-cols-3
            "
          >
            <BrandBenefit
              icon={UserRound}
              title="Expert"
              subtitle="Mentorship"
            />

            <BrandBenefit
              icon={BookOpen}
              title="Quality"
              subtitle="Learning"
              divided
            />

            <BrandBenefit
              icon={ShieldCheck}
              title="Better"
              subtitle="Outcomes"
              divided
            />
          </div>

          {/* Bottom label */}
          <p
            className="
              relative
              z-10
              font-body
              text-[0.7rem]
              text-white/40
            "
          >
            Secure programme portal
          </p>
        </aside>

        {/* =====================================================
            FORM SURFACE
        ====================================================== */}
        <section
          className="
            auth-form-surface
            relative
            flex
            min-h-screen
            items-start
            justify-center
            overflow-hidden
            bg-mist
            px-6
            py-7
            sm:px-10
            sm:py-9
            lg:px-14
            lg:py-10
            xl:px-20
          "
        >
          {/* Upper organic wash */}
          <div
            className="
              pointer-events-none
              absolute
              -right-32
              -top-32
              h-[24rem]
              w-[32rem]
              rotate-[12deg]
              rounded-[48%_52%_58%_42%]
              bg-teal/[0.045]
            "
            aria-hidden="true"
          />

          {/* Secondary upper wash */}
          <div
            className="
              pointer-events-none
              absolute
              -right-52
              top-16
              h-[17rem]
              w-[28rem]
              -rotate-[10deg]
              rounded-[45%_55%_60%_40%]
              bg-white/70
            "
            aria-hidden="true"
          />

          {/* Lower organic wash */}
          <div
            className="
              pointer-events-none
              absolute
              -bottom-40
              -right-48
              h-[25rem]
              w-[38rem]
              -rotate-[12deg]
              rounded-[55%_45%_38%_62%]
              bg-teal/[0.035]
            "
            aria-hidden="true"
          />

          {/* Dot grid */}
          <div
            className="
              pointer-events-none
              absolute
              right-12
              top-[9rem]
              hidden
              h-[5.5rem]
              w-[5.5rem]
              opacity-35
              xl:block
            "
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(43,166,166,0.65) 1.7px, transparent 1.9px)",
              backgroundSize: "17px 17px",
            }}
            aria-hidden="true"
          />

          {/* =====================================================
              PAGE CONTENT
          ====================================================== */}
          <div
            className="
              relative
              z-10
              w-full
              max-w-[40rem]
            "
          >
            {/* Mobile branding */}
            <div
              className="
                mb-10
                flex
                items-center
                justify-between
                lg:hidden
              "
            >
              <Link
                to="/"
                className="
                  inline-flex
                  items-center
                  gap-2.5
                  text-navy
                  no-underline
                "
              >
                <img
                  src={logoIcon}
                  alt=""
                  className="h-9 w-9 object-contain"
                  aria-hidden="true"
                />

                <span
                  className="
                    font-display
                    font-bold
                    tracking-tight
                  "
                >
                  MentorMAMA
                </span>
              </Link>

              <span
                className="
                  font-body
                  text-[0.68rem]
                  font-semibold
                  uppercase
                  tracking-[0.14em]
                  text-navy-muted
                "
              >
                Portal
              </span>
            </div>

            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

interface BrandBenefitProps {
  icon: typeof UserRound;
  title: string;
  subtitle: string;
  divided?: boolean;
}

function BrandBenefit({
  icon: Icon,
  title,
  subtitle,
  divided = false,
}: BrandBenefitProps) {
  return (
    <div
      className={`
        min-w-0
        px-4
        first:pl-0
        ${
          divided
            ? "border-l border-white/15"
            : ""
        }
      `}
    >
      <span
        className="
          flex h-11 w-11
          items-center justify-center
          rounded-full
          border border-teal/70
          bg-navy/35
          text-teal
          backdrop-blur-sm
        "
      >
        <Icon
          size={20}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </span>

      <p
        className="
          mt-3
          font-body
          text-[0.72rem]
          font-semibold
          text-white
        "
      >
        {title}
      </p>

      <p
        className="
          mt-0.5
          font-body
          text-[0.69rem]
          leading-4
          text-white/50
        "
      >
        {subtitle}
      </p>
    </div>
  );
}

export function BackLink({
  children = "Back to sign in",
}: {
  children?: ReactNode;
}) {
  return (
    <Link
      to="/"
      className="
        inline-flex
        min-h-10
        items-center
        gap-2
        font-body
        text-sm
        font-semibold
        text-navy-muted
        no-underline
        transition-colors
        hover:text-teal
        focus-visible:outline-none
        focus-visible:ring-2
        focus-visible:ring-teal/30
        focus-visible:ring-offset-4
      "
    >
      <ArrowLeft size={16} aria-hidden="true" />

      {children}
    </Link>
  );
}
