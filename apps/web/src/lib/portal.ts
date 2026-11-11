/**
 * Where the signed-in app lives. Set VITE_PORTAL_URL when building (render.yaml does); the local address is
 * only the fallback for `pnpm dev`, so a production build can never point visitors at localhost.
 */
export const portalUrl: string = (
  import.meta.env.VITE_PORTAL_URL ||
  (import.meta.env.DEV ? "http://localhost:5174" : "https://mentormama-portal.onrender.com")
).replace(/\/+$/, "");

/** The separate sign-in for platform administrators. */
export const platformSignInUrl = `${portalUrl}/platform`;
