/**
 * MentorMAMA Tailwind Preset
 *
 * Canonical design system shared across all MentorMAMA applications.
 *
 * Principles
 * ----------
 * • Calm, trustworthy, clinical
 * • White + Midnight Navy dominate
 * • Teal used intentionally as guidance
 * • Generous whitespace
 * • Soft elevation
 * * Enterprise healthcare aesthetic
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "../../apps/web/src/**/*.{js,ts,jsx,tsx}",
    "../../apps/portal/src/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],

  theme: {
    extend: {
      /* -------------------------------------------------------------------------- */
      /*                                   COLORS                                   */
      /* -------------------------------------------------------------------------- */

      colors: {
        navy: "#0D1B33",

        "navy-soft": "#22304A",

        "navy-muted": "#5E6C81",

        teal: "#1D8C8C",

        "teal-light": "#EAF6F6",

        mist: "#F4F7F8",

        stone: "#E4E8EE",

        terracotta: "#D97757",

        white: "#FFFFFF",

        surface: "#FFFFFF",

        border: "#E4E8EE",

        success: "#3E9A72",

        warning: "#D97757",

        error: "#C94B4B",
      },

      /* -------------------------------------------------------------------------- */
      /*                                 TYPOGRAPHY                                */
      /* -------------------------------------------------------------------------- */

      fontFamily: {
        display: ['"Manrope"', "sans-serif"],

        body: ['"Inter"', "sans-serif"],
      },

      fontSize: {
        "display-xl": [
          "4rem",
          {
            lineHeight: "1.05",
            fontWeight: "700",
          },
        ],

        display: [
          "3rem",
          {
            lineHeight: "1.1",
            fontWeight: "700",
          },
        ],

        h1: [
          "2.25rem",
          {
            lineHeight: "1.2",
            fontWeight: "700",
          },
        ],

        h2: [
          "1.75rem",
          {
            lineHeight: "1.3",
            fontWeight: "600",
          },
        ],

        h3: [
          "1.375rem",
          {
            lineHeight: "1.35",
            fontWeight: "600",
          },
        ],

        subheading: [
          "1rem",
          {
            lineHeight: "1.5",
            fontWeight: "600",
          },
        ],

        "body-lg": [
          "1.125rem",
          {
            lineHeight: "1.8",
            fontWeight: "400",
          },
        ],

        body: [
          "1rem",
          {
            lineHeight: "1.75",
            fontWeight: "400",
          },
        ],

        "body-sm": [
          ".875rem",
          {
            lineHeight: "1.6",
            fontWeight: "400",
          },
        ],

        caption: [
          ".75rem",
          {
            lineHeight: "1.5",
            fontWeight: "500",
          },
        ],
      },

      /* -------------------------------------------------------------------------- */
      /*                                  SPACING                                  */
      /* -------------------------------------------------------------------------- */

      spacing: {
        navbar: "5rem",

        "hero-y": "7rem",

        "hero-gap": "3rem",

        "content-gap": "2rem",

        "card-padding": "2rem",

        "section-gap": "5rem",

        "section-y": "5rem",

        "container-x": "2rem",
      },

      /* -------------------------------------------------------------------------- */
      /*                                MAX WIDTHS                                 */
      /* -------------------------------------------------------------------------- */

      maxWidth: {
        reading: "42rem",

        content: "48rem",

        hero: "52rem",

        section: "76rem",

        page: "80rem",
      },

      /* -------------------------------------------------------------------------- */
      /*                               BORDER RADIUS                               */
      /* -------------------------------------------------------------------------- */

      borderRadius: {
        xs: "6px",

        sm: "10px",

        DEFAULT: "14px",

        lg: "18px",

        xl: "24px",

        "2xl": "32px",

        pill: "9999px",
      },

      /* -------------------------------------------------------------------------- */
      /*                                  SHADOWS                                  */
      /* -------------------------------------------------------------------------- */

      boxShadow: {
        subtle: "0 1px 3px rgba(13,27,51,.05)",

        soft: "0 8px 24px rgba(13,27,51,.08)",

        medium: "0 16px 40px rgba(13,27,51,.10)",

        large: "0 24px 60px rgba(13,27,51,.12)",

        floating: "0 30px 80px rgba(13,27,51,.15)",
      },

      /* -------------------------------------------------------------------------- */
      /*                               BACKDROP BLUR                               */
      /* -------------------------------------------------------------------------- */

      backdropBlur: {
        xs: "2px",

        glass: "14px",
      },

      /* -------------------------------------------------------------------------- */
      /*                              TRANSITIONS                                  */
      /* -------------------------------------------------------------------------- */

      transitionDuration: {
        fast: "150ms",

        DEFAULT: "200ms",

        slow: "350ms",
      },

      transitionTimingFunction: {
        smooth: "cubic-bezier(.2,.8,.2,1)",
      },

      /* -------------------------------------------------------------------------- */
      /*                                  Z INDEX                                  */
      /* -------------------------------------------------------------------------- */

      zIndex: {
        header: "50",

        dropdown: "100",

        modal: "500",

        toast: "600",

        tooltip: "700",
      },

      /* -------------------------------------------------------------------------- */
      /*                                ANIMATIONS                                 */
      /* -------------------------------------------------------------------------- */

      keyframes: {
        fadeUp: {
          from: {
            opacity: "0",
            transform: "translateY(12px)",
          },

          to: {
            opacity: "1",
            transform: "translateY(0)",
          },
        },

        fade: {
          from: {
            opacity: "0",
          },

          to: {
            opacity: "1",
          },
        },

        pulseSoft: {
          "0%,100%": {
            opacity: "1",
          },

          "50%": {
            opacity: ".7",
          },
        },
      },

      animation: {
        "fade-up": "fadeUp .45s ease forwards",

        fade: "fade .35s ease forwards",

        pulse: "pulseSoft 2.5s ease-in-out infinite",
      },
    },
  },

  plugins: [],
};