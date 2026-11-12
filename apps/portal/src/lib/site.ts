/** Facts the app repeats. Set VITE_SUPPORT_EMAIL at build time to change the address people are sent to for help. */
export const supportEmail: string = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || "mentormama@sinapstechnology.tech";
