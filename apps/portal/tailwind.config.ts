import type { Config } from "tailwindcss";
import preset from "@mentormama/tailwind-preset";

export default {
  presets: [preset],
  // The shared UI package is scanned too: its components (Skeleton, Card, …) use utility classes that would
  // otherwise never be generated, which left every default loading skeleton transparent.
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}", "../../packages/ui/src/**/*.{js,ts,jsx,tsx}"],
} satisfies Config;
