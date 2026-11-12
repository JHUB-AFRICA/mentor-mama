/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PORTAL_URL?: string;
  /** Optional: absolute API origin for the website forms. Empty = same origin (/api is proxied). */
  readonly VITE_API_URL?: string;
  /** Optional Cloudflare Turnstile site key for the public forms. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
