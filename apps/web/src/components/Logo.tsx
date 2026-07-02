interface LogoProps {
  className?: string;
  size?: number;
  iconOnly?: boolean;
  variant?: "light" | "dark";
}

export default function Logo({ className = "", size = 32, iconOnly = false, variant = "light" }: LogoProps) {
  // Midnight Navy vs White for the outer curve
  const outerColor = variant === "light" ? "#0D1B33" : "#FFFFFF"; 
  // Guiding Teal (Ocean Teal) for the inner ring
  const innerColor = "#1D8C8C"; 

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0 animate-fade-in"
      >
        {/* Outer Curve (U-shape) - precisely centered on 100x100 grid */}
        <path
          d="M14 11V53C14 72.88 30.12 89 50 89C69.88 89 86 72.88 86 53V45"
          stroke={outerColor}
          strokeWidth="11"
          strokeLinecap="round"
          className="transition-colors duration-300"
        />
        {/* Inner Ring - nested centered circle */}
        <circle
          cx="50"
          cy="53"
          r="14.5"
          stroke={innerColor}
          strokeWidth="9"
          className="transition-colors duration-300"
        />
      </svg>
      {!iconOnly && (
        <div className="flex flex-col justify-center">
          <span
            className={`font-display font-semibold tracking-tight leading-none ${
              variant === "light" ? "text-navy text-[17px]" : "text-white text-[19px]"
            }`}
          >
            Mentor<span className="text-sage">MAMA</span>
          </span>
          {variant === "dark" && (
            <span className="text-[9px] font-medium text-sage tracking-wider mt-1 uppercase">
              Better mentorship. Better outcomes.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
