import type { Ref } from "react";

interface SoundIndicatorProps {
  muted: boolean;
  onClick: () => void;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

const BAR_TIMINGS = [
  { duration: "1.8s", delay: "0s" },
  { duration: "2s", delay: "0.15s" },
  { duration: "1.5s", delay: "0.3s" },
];

export function SoundIndicator({
  muted,
  onClick,
  className,
  ref,
}: SoundIndicatorProps) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-pressed={!muted}
      aria-label={muted ? "Activar sonido" : "Silenciar sonido"}
      className={`flex items-end gap-0.75 h-1.5 transition-opacity cursor-pointer duration-300 ${muted ? "opacity-50" : "opacity-100"} ${className ?? ""}`}
    >
      {BAR_TIMINGS.map((bar, i) => (
        <span
          key={i}
          className="w-0.5 h-full bg-white origin-bottom animate-[eq-bounce_1s_ease-in-out_infinite]"
          style={{
            animationDuration: bar.duration,
            animationDelay: bar.delay,
          }}
        />
      ))}
    </button>
  );
}
