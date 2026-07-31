import { useEffect, useRef } from "react";
import gsap from "gsap";
import {
  BRAND_ACCENT,
  MARK_BOX,
  MARK_PATH,
  MARK_RING,
  TAGLINE_PATH,
  WORDMARK_BOX,
  WORDMARK_PATH,
  TAGLINE_BOX,
} from "./brand/marks";

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
    // Measured from the real artwork rather than hardcoded: the mark is a filled
    // outline, so we trace its contour and then fade the fill in behind it.
    const pathLength = pathRef.current?.getTotalLength() ?? 0;
    const circleLength = 2 * Math.PI * MARK_RING.r;

    // Set initial stroke dasharray & offsets for clean vector drawing
    gsap.set(pathRef.current, {
      strokeDasharray: pathLength,
      strokeDashoffset: pathLength,
      fill: "rgba(255,255,255,0)",
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

    let introFinished = false;
    let pageLoaded = document.readyState === "complete";

    const playOutro = () => {
      const outroTl = gsap.timeline({
        onComplete: onComplete,
      });

      // Stop looping animations cleanly
      gsap.killTweensOf([svgRef.current, wave1Ref.current, wave2Ref.current]);

      outroTl.to(textRef.current, {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        duration: 0.8,
        ease: "power3.out",
      })
      .fromTo(textRef.current,
        { scale: 0.96 },
        { scale: 1, duration: 1.1, ease: "power2.out", transformOrigin: "center" },
        "-=0.8"
      )
      .to(containerRef.current, {
        opacity: 0,
        scale: 1.05,
        filter: "blur(6px)",
        duration: 0.8,
        ease: "power2.inOut",
      }, "+=0.4");
    };

    const checkAndTransition = () => {
      if (pageLoaded && introFinished) {
        playOutro();
      }
    };

    const handleLoad = () => {
      pageLoaded = true;
      checkAndTransition();
    };

    if (!pageLoaded) {
      window.addEventListener("load", handleLoad);
    }

    // Intro timeline
    const introTl = gsap.timeline({
      onComplete: () => {
        introFinished = true;
        
        // Loop standard spin & pulse if page isn't ready
        if (!pageLoaded) {
          gsap.to(svgRef.current, {
            rotation: "+=360",
            duration: 2.5,
            repeat: -1,
            ease: "none",
          });
          gsap.to([wave1Ref.current, wave2Ref.current], {
            opacity: 0.25,
            scale: 2.2,
            duration: 1.5,
            stagger: 0.4,
            repeat: -1,
            ease: "power1.out",
          });
        }
        checkAndTransition();
      },
    });

    // 1. Trace the mark's contour
    introTl.to(pathRef.current, {
      strokeDashoffset: 0,
      duration: 1.4,
      ease: "power3.inOut",
    })
    // 1b. Settle into the solid mark
    .to(pathRef.current, {
      fill: "rgba(255,255,255,1)",
      duration: 0.5,
      ease: "power2.out",
    }, "-=0.35")
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
    }, "-=1.4");

    return () => {
      window.removeEventListener("load", handleLoad);
      introTl.kill();
      gsap.killTweensOf([svgRef.current, wave1Ref.current, wave2Ref.current, containerRef.current, textRef.current]);
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

        {/* The master mark — traced, then filled (see ./brand/marks) */}
        <svg
          ref={svgRef}
          width="88"
          height={(88 * MARK_BOX.height) / MARK_BOX.width}
          viewBox={`0 0 ${MARK_BOX.width} ${MARK_BOX.height}`}
          className="mb-8 drop-shadow-[0_0_12px_rgba(29,140,140,0.35)]"
          aria-hidden
        >
          <path
            ref={pathRef}
            d={MARK_PATH}
            fill="rgba(255,255,255,0)"
            stroke="#FFFFFF"
            strokeWidth="14"
          />
          <circle
            ref={circleRef}
            cx={MARK_RING.cx}
            cy={MARK_RING.cy}
            r={MARK_RING.r}
            fill="none"
            stroke={BRAND_ACCENT}
            strokeWidth={MARK_RING.strokeWidth}
          />
        </svg>

        {/* Logotype and tagline — master outlines, never re-set as live type */}
        <div ref={textRef}>
          <svg
            width="230"
            height={(230 * (TAGLINE_BOX.top + TAGLINE_BOX.height)) / WORDMARK_BOX.width}
            viewBox={`0 0 ${WORDMARK_BOX.width} ${TAGLINE_BOX.top + TAGLINE_BOX.height}`}
            role="img"
            aria-label="MentorMAMA — Better mentorship. Better outcomes."
          >
            <path d={WORDMARK_PATH} fill="#FFFFFF" />
            <path d={TAGLINE_PATH} fill={BRAND_ACCENT} />
          </svg>
        </div>
      </div>
    </div>
  );
}
