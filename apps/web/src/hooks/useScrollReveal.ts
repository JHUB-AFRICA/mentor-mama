import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface ScrollRevealOptions {
  y?: number;
  duration?: number;
  stagger?: number;
  ease?: string;
  start?: string;
  skewY?: number;
}

export function useScrollReveal<T extends HTMLElement>(
  options: ScrollRevealOptions = {},
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const {
      y = 60,
      duration = 1,
      stagger = 0.15,
      ease = "power3.out",
      start = "top 85%",
      skewY = 3,
    } = options;

    const children = el.querySelectorAll("[data-reveal]");
    const targets = children.length > 0 ? Array.from(children) : [el];

    const isHeading = (t: Element) => {
      const tag = t.tagName.toLowerCase();
      return tag === "h1" || tag === "h2" || tag === "h3";
    };

    targets.forEach((t) => {
      const sY = isHeading(t) ? skewY : 0;
      gsap.set(t, { opacity: 0, y, skewY: sY });
    });

    const tl = gsap.to(targets, {
      opacity: 1,
      y: 0,
      skewY: 0,
      duration,
      stagger,
      ease,
      scrollTrigger: {
        trigger: el,
        start,
        toggleActions: "play none none none",
      },
    });

    return () => {
      tl.kill();
    };
  }, []);

  return ref;
}

export function useImageReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const img = el.querySelector("img");
    if (!img) return;

    gsap.set(img, { scale: 1.2 });
    gsap.set(el, { opacity: 0 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        toggleActions: "play none none none",
      },
    });

    tl.to(el, { opacity: 1, duration: 0.1 }).to(
      img,
      { scale: 1, duration: 1.2, ease: "power3.inOut" },
      0,
    );

    return () => {
      tl.kill();
    };
  }, []);

  return ref;
}
