// src/components/risk/ThresholdSlider.tsx

interface ThresholdSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  leftLabel?: string;
  rightLabel?: string;
}

/** The cost-weighted decision threshold control. Used standalone on
 * ScoreOrder, and reused by PolicySimulator on the Dashboard.
 *
 * Direction matters here and is easy to get backwards: LOW threshold
 * (left, near min) means almost every order gets flagged — that's HIGH
 * recall (catches most fraud) but also the most false positives. HIGH
 * threshold (right, near max) means almost nothing gets flagged — LOW
 * recall (misses most fraud) but FEW false positives among what is
 * flagged. So "catch more fraud" belongs on the left, "fewer false
 * positives" belongs on the right — verified against the real
 * threshold_sweep data (recall 98.7% at 0.05, recall 6.2% at 0.95). */
export default function ThresholdSlider({
  value,
  onChange,
  min = 0.05,
  max = 0.95,
  step = 0.05,
  leftLabel = "Catch more fraud",
  rightLabel = "Fewer false positives",
}: ThresholdSliderProps) {
  return (
    <div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--accent)" }}
        aria-label="Decision threshold"
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
        }}
      >
        <span style={{ color: "var(--text-muted)" }}>{leftLabel}</span>
        <span style={{ color: "var(--accent)" }}>{value.toFixed(2)}</span>
        <span style={{ color: "var(--text-muted)" }}>{rightLabel}</span>
      </div>
    </div>
  );
}