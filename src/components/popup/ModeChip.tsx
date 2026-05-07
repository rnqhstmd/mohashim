import type { Phase } from "../../lib/score";
import { useIdleChipLabel } from "../../lib/idleChip";

type ModeChipProps = {
  phase: Phase;
};

/**
 * 우상단 ModeChip — phase에 따라 색/라벨/pulse dot이 달라진다.
 *
 * - Idle: chipIdle 회색 + 회전 라벨 (useIdleChipLabel), pulse dot 없음.
 * - Focus: chipFocus 적색 + "집중 중" + mhpulse dot.
 * - Break: chipBreak 주황 + "휴식 중" + mhpulse dot.
 * - Complete/Discarded: chip 미표시 (return null).
 */
export function ModeChip({ phase }: ModeChipProps) {
  const idleLabel = useIdleChipLabel(phase === "idle");

  if (phase === "complete" || phase === "discarded") {
    return null;
  }

  let bgClass: string;
  let label: string;
  let showPulse: boolean;

  if (phase === "focus") {
    bgClass = "bg-chipFocus";
    label = "집중 중";
    showPulse = true;
  } else if (phase === "break") {
    bgClass = "bg-chipBreak";
    label = "휴식 중";
    showPulse = true;
  } else {
    // idle
    bgClass = "bg-chipIdle";
    label = idleLabel;
    showPulse = false;
  }

  return (
    <div
      className={`absolute right-3 top-3 z-30 inline-flex items-center rounded-full border border-ink/80 px-2.5 py-1 text-xs font-bold text-white shadow-[1.5px_1.5px_0_0_#2b2520] ${bgClass}`}
    >
      {showPulse && (
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-white animate-mhpulse" />
      )}
      <span>{label}</span>
    </div>
  );
}
