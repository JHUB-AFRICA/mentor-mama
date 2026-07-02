import { useEffect, useRef } from "react";
import gsap from "gsap";

interface PreloaderProps {
  onComplete: () => void;
}

export default function Preloader({ onComplete }: PreloaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const circleRef = useRef<SVGCircleElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  // Creative pulsing background waves
  const wave1Ref = useRef<HTMLDivElement>(null);
  const wave2Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Precise SVG path/circle dimensions
    const pathLength = 165;
    const circleLength = 92;

    // Set initial stroke dasharray & offsets for clean vector drawing
    gsap.set(pathRef.current, {
      strokeDasharray: pathLength,
      strokeDashoffset: pathLength,
    });
    
    gsap.set(circleRef.current, {
      strokeDasharray: circleLength,
      strokeDashoffset: circleLength,
      transformOrigin: "center",
      rotation: -90,
    });

    // Set initial text blur/offset
    gsap.set(textRef.current, {
      opacity: 0,
      y: 20,
      filter: "blur(8px)",
    });

    const tl = gsap.timeline({
      onComplete: () => {
        // Modern exit: fade out, scale up, and blur overlay
        gsap.to(containerRef.current, {
          opacity: 0,
          scale: 1.05,
          filter: "blur(6px)",
          duration: 0.8,
          ease: "power2.inOut",
          onComplete: onComplete,
        });
      },
    });

    // 1. Draw outer U-curve
    tl.to(pathRef.current, {
      strokeDashoffset: 0,
      duration: 1.4,
      ease: "power3.inOut",
    })
    // 2. Draw inner Teal circle
    .to(circleRef.current, {
      strokeDashoffset: 0,
      duration: 1.0,
      ease: "power2.out",
    }, "-=0.9")
    // 3. Smoothly spin the logo SVG
    .to(svgRef.current, {
      rotation: 360,
      duration: 2.2,
      ease: "power4.out",
    }, "-=1.4")
    // 4. Trigger concentric wave rings
    .to([wave1Ref.current, wave2Ref.current], {
      opacity: 0.35,
      scale: 1.8,
      duration: 0.8,
      stagger: 0.15,
      ease: "power2.out",
    }, "-=1.1")
    .to([wave1Ref.current, wave2Ref.current], {
      opacity: 0,
      scale: 2.6,
      duration: 0.8,
      stagger: 0.15,
      ease: "power2.in",
    }, "-=0.7")
    // 5. Fade & de-blur wordmark and tagline while compressing letter-spacing
    .to(textRef.current, {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      duration: 0.8,
      ease: "power3.out",
    }, "-=1.2")
    .fromTo(textRef.current, 
      { letterSpacing: "0.22em" },
      { letterSpacing: "0.02em", duration: 1.1, ease: "power2.out" },
      "-=1.2"
    )
    // 6. Hold frame
    .to({}, { duration: 0.6 });

    return () => {
      tl.kill();
    };
  }, [onComplete]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-[#0D1B33] flex flex-col items-center justify-center text-white select-none overflow-hidden"
      style={{
        backgroundImage: "radial-gradient(circle at center, rgba(29, 140, 140, 0.12) 0%, rgba(13, 27, 51, 1) 75%)",
      }}
    >
      <div className="flex flex-col items-center text-center relative">
        {/* Pulsing Aura Rings */}
        <div 
          ref={wave1Ref}
          className="absolute w-24 h-24 rounded-full border border-sage/40 opacity-0 scale-50 pointer-events-none -top-2 left-1/2 -translate-x-1/2" 
        />
        <div 
          ref={wave2Ref}
          className="absolute w-24 h-24 rounded-full border border-sage/20 opacity-0 scale-50 pointer-events-none -top-2 left-1/2 -translate-x-1/2" 
        />

        {/* Animated Vector Logo Icon */}
        <svg
          ref={svgRef}
          width="80"
          height="80"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="mb-8 drop-shadow-[0_0_12px_rgba(29,140,140,0.35)]"
        >
          {/* Outer Curve */}
          <path
            ref={pathRef}
            d="M14 11V53C14 72.88 30.12 89 50 89C69.88 89 86 72.88 86 53V45"
            stroke="#FFFFFF"
            strokeWidth="11"
            strokeLinecap="round"
          />
          {/* Inner Ring */}
          <circle
            ref={circleRef}
            cx="50"
            cy="53"
            r="14.5"
            stroke="#1D8C8C"
            strokeWidth="9"
          />
        </svg>

        {/* Wordmark and Tagline */}
        <div ref={textRef} className="space-y-4">
          <h2 className="font-display font-semibold text-2xl tracking-wide leading-none text-white uppercase">
            Mentor<span className="text-sage">MAMA</span>
          </h2>
          <p className="text-[9px] font-medium text-sage tracking-[0.25em] uppercase">
            Better mentorship. Better outcomes.
          </p>
        </div>
      </div>
    </div>
  );
}
