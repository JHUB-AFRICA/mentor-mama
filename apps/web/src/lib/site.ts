/** One place for facts the website repeats (footer, privacy notice, contact page). */
export const contactEmail: string = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) || "mentormama@sinapstechnology.tech";

export type Partner = { name: string; href: string; logo: string; role: string; width: number; height: number };

/** Programme partners. Logos live in /public/partners (trimmed, optimised). Order = how they are shown. */
export const partners: Partner[] = [
  { name: "Jomo Kenyatta University of Agriculture and Technology", href: "https://www.jkuat.ac.ke", logo: "/partners/jkuat.png", role: "Academic partner", width: 182, height: 193 },
  { name: "JHUB Africa", href: "https://jhubafrica.com", logo: "/partners/jhub-africa.png", role: "Innovation partner", width: 361, height: 170 },
  { name: "Samsung", href: "https://www.samsung.com", logo: "/partners/samsung.png", role: "Technology partner", width: 720, height: 114 },
  { name: "AfyaVentures", href: "https://afyaventures.amref.org/", logo: "/partners/afyaventures.png", role: "Community health partner", width: 720, height: 211 },
  { name: "Sinaps Technology", href: "https://sinapstechnology.tech", logo: "/partners/sinaps-technology.png", role: "Built by", width: 364, height: 185 },
];
