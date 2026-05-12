import type { Phase } from "../../lib/score";

type ModeChipProps = {
  phase: Phase;
};

/**
 * 우상단 ModeChip — focus/break 진행 중에만 노출.
 *
 * Phase 21 사용자 피드백: idle 상태의 회전 라벨("음료 홀짝이는 중", "명상 중" 등)은
 * 불필요하다는 피드백 → idle/complete/discarded 모두 chip 미노출.
 *
 * - Focus: chipFocus 적색 + "집중 중" + mhpulse dot.
 * - Break: chipBreak 연두 + "휴식 중" + mhpulse dot.
 * - 그 외 (Idle/Complete/Discarded): chip 미표시.
 */
export function ModeChip({ phase }: ModeChipProps) {
  if (phase !== "focus" && phase !== "break") {
    return null;
  }

  const bgClass = phase === "focus" ? "bg-chipFocus" : "bg-chipBreak";
  const label = phase === "focus" ? "집중 중" : "휴식 중";

  return (
    <div
      className={`absolute right-3 top-3 z-30 inline-flex items-center rounded-full border border-ink/80 px-2.5 py-1 text-xs font-bold text-white shadow-[1.5px_1.5px_0_0_#2b2520] ${bgClass}`}
    >
      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-white animate-mhpulse" />
      <span>{label}</span>
    </div>
  );
}
