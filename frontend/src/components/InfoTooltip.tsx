import React from "react";
import { HelpCircle } from "lucide-react";

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  position?: "top" | "bottom";
  className?: string;
}

/**
 * Accessible hover/focus tooltip wrapper for buttons and interactive controls.
 */
export const Tooltip: React.FC<TooltipProps> = ({
  text,
  children,
  position = "bottom",
  className = "",
}) => {
  const posCls =
    position === "top"
      ? "bottom-full mb-2 left-1/2 -translate-x-1/2"
      : "top-full mt-2 left-1/2 -translate-x-1/2";

  return (
    <div className={`relative inline-flex group/tip ${className}`}>
      {children}
      <div
        role="tooltip"
        className={`pointer-events-none absolute ${posCls} z-50 w-56 sm:w-64 rounded-lg border border-slate-700 bg-slate-950/95 px-2.5 py-2 text-[11px] font-normal leading-snug text-slate-200 shadow-xl opacity-0 scale-95 transition-all duration-150 group-hover/tip:opacity-100 group-hover/tip:scale-100 group-focus-within/tip:opacity-100 group-focus-within/tip:scale-100`}
      >
        {text}
      </div>
    </div>
  );
};

interface InfoBadgeProps {
  text: string;
  position?: "top" | "bottom";
}

export const InfoBadge: React.FC<InfoBadgeProps> = ({ text, position = "top" }) => (
  <Tooltip text={text} position={position}>
    <span
      tabIndex={0}
      aria-label={text}
      className="inline-flex items-center justify-center rounded-full text-slate-400 hover:text-cyan-300 focus:text-cyan-300 focus:outline-none cursor-help"
    >
      <HelpCircle className="w-3.5 h-3.5" />
    </span>
  </Tooltip>
);
