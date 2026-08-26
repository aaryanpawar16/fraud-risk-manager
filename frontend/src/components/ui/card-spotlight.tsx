// src/components/ui/card-spotlight.tsx
// Mouse-tracking spotlight card, adapted from the Aceternity UI pattern:
//   - no "use client"
//   - imports from "framer-motion" (already a project dependency) instead
//     of "motion/react" — same API, different package name
//   - default border/background/radius now reference the project's design
//     tokens (bg-surface, border-hairline, rounded-md — all mapped to CSS
//     variables in tailwind.config.js) instead of the original's
//     hardcoded bg-black / border-neutral-800
//   - default spotlight color is a translucent accent-blue tint rather
//     than a flat gray, and the CanvasRevealEffect dot colors default to
//     the accent blue family instead of blue/purple, to keep the "one
//     restrained accent" rule intact
import { useMotionValue, motion, useMotionTemplate } from "framer-motion";
import React, { type MouseEvent as ReactMouseEvent, useState } from "react";
import { CanvasRevealEffect } from "@/components/ui/canvas-reveal-effect";
import { cn } from "@/lib/utils";

export const CardSpotlight = ({
  children,
  radius = 1000,
  color = "rgba(91, 145, 253, 0.12)",
  revealColors = [
    [91, 141, 239],
    [122, 163, 242],
  ],
  className,
  ...props
}: {
  radius?: number;
  color?: string;
  revealColors?: number[][];
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) => {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: ReactMouseEvent<HTMLDivElement>) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  const [isHovering, setIsHovering] = useState(false);
  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => setIsHovering(false);

  return (
    <div
      className={cn("group/spotlight relative rounded-md border border-hairline bg-surface", className)}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      <motion.div
        className="pointer-events-none absolute z-0 -inset-px rounded-md opacity-0 transition duration-300 group-hover/spotlight:opacity-100"
        style={{
          backgroundColor: color,
          maskImage: useMotionTemplate`
            radial-gradient(
              ${radius}px circle at ${mouseX}px ${mouseY}px,
              white,
              transparent 20%
            )
          `,
        }}
      >
        {isHovering && (
          <CanvasRevealEffect
            animationSpeed={5}
            containerClassName="bg-transparent absolute inset-0 pointer-events-none"
            colors={revealColors}
            dotSize={3}
          />
        )}
      </motion.div>
      <div className="relative z-20">{children}</div>
    </div>
  );
};
