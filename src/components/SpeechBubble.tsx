export type SpeechBubbleProps = {
  text: string;
  color?: string;
  className?: string;
};

// Phase 21 사용자 피드백 (재개정): max-w-[180px]로 텍스트가 일찍 줄바꿈되는 회귀.
// 컨테이너 폭(FocusStartButton/PomodoroCard 안 ~210px)을 거의 채우도록 [210px]로 확대.
// inline-block + break-words 유지로 멘트가 컨테이너 밖으로는 나가지 않음.
const BASE_CLASS =
  "relative inline-block max-w-[210px] rounded-[14px] border-[1.5px] border-ink px-3 py-2 shadow-[2px_2px_0_0_#2b2520]";

// Mohashim Design.html(PAPER 톤). 페이퍼 표면과 자연스럽게 어울린다.
const PAPER_DEFAULT = "#fdf8ef";

export function SpeechBubble({ text, color = PAPER_DEFAULT, className }: SpeechBubbleProps) {
  if (!text) return null;

  const containerClass = [BASE_CLASS, className].filter(Boolean).join(" ");

  return (
    <div className={containerClass} style={{ backgroundColor: color }}>
      <span className="block break-words text-sm leading-tight text-ink">
        {text}
      </span>
      {/* Phase 21 사용자 피드백: 말풍선 꼬리는 Potato 방향(좌측)을 가리켜야 함.
          기존 ▽(아래 향함) → ◁(좌측 향함) — bubble 좌하단에서 좌측으로 뻗는 삼각형. */}
      <span
        aria-hidden="true"
        data-testid="bubble-tail"
        className="absolute -left-[6px] bottom-3 h-3 w-3 rotate-45 border-[1.5px] border-b-ink border-l-ink border-r-transparent border-t-transparent"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}
