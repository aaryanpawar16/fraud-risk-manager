// src/components/ui/circular-progress.tsx

/**
 * Indeterminate circular progress ring — deliberately NOT a determinate
 * percentage bar. The batch-scoring endpoint is a single synchronous
 * request with no streaming progress data (see backend/app/services/
 * batch_scorer.py — it returns once, when everything is done, not
 * incrementally). Showing a fake "47%" would mean fabricating a number
 * with no real data behind it, which is exactly the kind of thing this
 * project has otherwise gone out of its way to avoid. An indeterminate
 * ring — "working, no promises about how long" — is the honest version
 * of a circular progress indicator here.
 */
export function CircularProgress({ size = 32, strokeWidth = 3, color = "var(--accent)" }: { size?: number; strokeWidth?: number; color?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="circular-progress-rotate"
      role="status"
      aria-label="Loading"
    >
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border-hairline-strong)" strokeWidth={strokeWidth} opacity={0.4} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        className="circular-progress-arc"
        style={{ ["--circumference" as string]: circumference }}
      />
    </svg>
  );
}
