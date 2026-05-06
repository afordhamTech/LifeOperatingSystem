import { useEffect, useState } from "react";

interface StatusRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  showValue?: boolean;
}

export function getStatusColor(score: number): string {
  if (score <= 0) return "#8c8478";
  if (score >= 8) return "#6a9a74";
  if (score >= 6.5) return "#c39a4e";
  if (score >= 4.5) return "#6b87ae";
  return "#c97a73";
}

export function getStatusLabel(score: number): string {
  if (score <= 0) return "No Data";
  if (score >= 8) return "Good";
  if (score >= 6.5) return "Caution";
  if (score >= 4.5) return "Needs Attention";
  return "Critical";
}

export default function StatusRing({
  score,
  size = 60,
  strokeWidth = 4,
  label,
  sublabel,
  showValue = true,
}: StatusRingProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const color = getStatusColor(score);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(1, Math.max(0, animatedScore / 10));
  const dashOffset = circumference - progress * circumference;

  useEffect(() => {
    const duration = 800;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedScore(score * eased);
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [score]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(111, 104, 95, 0.16)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color}25)` }}
          />
        </svg>
        {showValue && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold" style={{ color }}>
              {animatedScore.toFixed(1)}
            </span>
          </div>
        )}
      </div>
      {label && (
        <span className="text-[10px] uppercase tracking-wider text-[#6f685f] font-medium">
          {label}
        </span>
      )}
      {sublabel && (
        <span className="text-[10px] text-[#8c8478]">{sublabel}</span>
      )}
    </div>
  );
}
