// src/components/ui/wavy-background.tsx
// Animated wave canvas. Adapted from the Aceternity UI "Wavy Background"
// pattern for a plain Vite + React project, with three deliberate changes
// from the original:
//   1. No "use client" — meaningless in a Vite SPA.
//   2. Sizes itself to its own container via ResizeObserver, not
//      window.innerWidth/innerHeight — the original assumed a full-viewport
//      h-screen hero; ours needs to fit inside a bounded hero section.
//   3. Uses clearRect (true transparency) instead of a semi-transparent
//      fillRect trail effect, which required an opaque backgroundFill
//      color. We need this layer to sit transparently behind the sparkles
//      effect, not paint its own background box.
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { createNoise3D } from "simplex-noise";

interface WavyBackgroundProps {
  children?: React.ReactNode;
  className?: string;
  containerClassName?: string;
  colors?: string[];
  waveWidth?: number;
  blur?: number;
  speed?: "slow" | "fast";
  waveOpacity?: number;
}

export function WavyBackground({
  children,
  className,
  containerClassName,
  colors,
  waveWidth,
  blur = 10,
  speed = "fast",
  waveOpacity = 0.5,
}: WavyBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSafari, setIsSafari] = useState(false);

  useEffect(() => {
    setIsSafari(
      typeof window !== "undefined" &&
        navigator.userAgent.includes("Safari") &&
        !navigator.userAgent.includes("Chrome")
    );
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const noise = createNoise3D();
    let w = 0;
    let h = 0;
    let nt = 0;
    let animationId: number;

    // Blue-toned by default to match the console's restrained accent
    // palette, rather than the original's five-color rainbow.
    const waveColors = colors ?? ["#5b8def", "#f899e2", "#3f6bc4", "#eff1f5", "#2f4a80"];

    const getSpeed = () => (speed === "fast" ? 0.001 : 0.002);

    const resize = () => {
      w = canvas.width = container.clientWidth;
      h = canvas.height = container.clientHeight;
      ctx.filter = `blur(${blur}px)`;
    };

    const drawWave = (count: number) => {
      nt += getSpeed();
      for (let i = 0; i < count; i++) {
        ctx.beginPath();
        ctx.lineWidth = waveWidth || 50;
        ctx.strokeStyle = waveColors[i % waveColors.length];
        for (let x = 0; x < w; x += 5) {
          const y = noise(x / 800, 0.3 * i, nt) * (h * 0.12);
          ctx.lineTo(x, y + h * 0.5);
        }
        ctx.stroke();
        ctx.closePath();
      }
    };

    const render = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = waveOpacity;
      drawWave(5);
      animationId = requestAnimationFrame(render);
    };

    resize();
    render();

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      cancelAnimationFrame(animationId);
      observer.disconnect();
    };
  }, [colors, waveWidth, blur, speed, waveOpacity]);

  return (
    <div ref={containerRef} className={cn("relative h-full w-full overflow-hidden", containerClassName)}>
      <canvas ref={canvasRef} className="absolute inset-0" style={isSafari ? { filter: `blur(${blur}px)` } : undefined} />
      {children && <div className={cn("relative z-10", className)}>{children}</div>}
    </div>
  );
}
