export type SpeechBubbleProps = {
  text: string;
  color?: string;
  className?: string;
};

const BASE_CLASS =
  "relative inline-block rounded-[14px] border-[1.5px] border-ink px-3 py-2 shadow-[2px_2px_0_0_#2b2520]";

export function SpeechBubble({ text, color = "#ffffff", className }: SpeechBubbleProps) {
  if (!text) return null;

  const containerClass = [BASE_CLASS, className].filter(Boolean).join(" ");

  return (
    <div
      className={containerClass}
      style={{ backgroundColor: color }}
    >
      <span className="font-pretendard text-sm text-ink">{text}</span>
      <span
        aria-hidden="true"
        data-testid="bubble-tail"
        className="absolute -bottom-[6px] left-3 h-3 w-3 rotate-45 border-[1.5px] border-l-ink border-b-ink border-r-transparent border-t-transparent"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}
