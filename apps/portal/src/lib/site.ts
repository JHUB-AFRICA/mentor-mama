/** Facts the app repeats. Set VITE_SUPPORT_EMAIL at build time to change the address people are sent to for help. */
export const supportEmail: string = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || "mentormama@sinapstechnology.tech";

/**
 * The public MentorMAMA website. Set VITE_WEBSITE_URL when building (render.yaml does); the local address is only the
 * fallback for `pnpm dev`, so a production build can never point people at localhost.
 */
export const websiteUrl: string = (
  (import.meta.env.VITE_WEBSITE_URL as string | undefined)?.trim() ||
  (import.meta.env.DEV ? "http://localhost:5173" : "https://mentormama-website.onrender.com")
).replace(/\/+$/, "");
