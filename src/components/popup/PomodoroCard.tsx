import { Potato } from "../Potato";
import { SpeechBubble } from "../SpeechBubble";
import type { PotatoState } from "../../lib/phrases";

type PomodoroCardProps = {
  phase: "focus" | "break" | "complete";
  timeLeft: number;
  potatoState: PotatoState;
  phrase: string;
  onTimerClick: () => void;
};

function formatMmSs(secs: number): string {
  const safe = Math.max(0, Math.floor(secs));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Todos 탭 상단 압축 카드 — focus/break/complete phase에서 노출.
 *
 * 카드 영역 ~120px 높이로 압축하여 todos 본체 공간 확보 (옵션 A 통합, M1).
 *
 * Phase 17 (B2-F): [그만하기] 버튼 제거. 타이머 영역을 버튼으로 감싸 클릭 시
 * TimerDetailScreen 진입 (onTimerClick). complete phase에서는 클릭 무시
 * (TodosTab의 phase effect와 race 방지).
 */
export function PomodoroCard({
  phase,
  timeLeft,
  potatoState,
  phrase,
  onTimerClick,
}: PomodoroCardProps) {
  const isComplete = phase === "complete";

  return (
    <div className="border-b border-ink/10 bg-paperWarm/70 px-3 py-2 backdrop-blur-[1px]">
      <div className="flex items-center gap-3">
        <Potato state={potatoState} size={80} animated={true} />
        <div className="flex flex-1 flex-col gap-1">
          <SpeechBubble text={phrase} />
          <button
            type="button"
            onClick={onTimerClick}
            disabled={isComplete}
            className="flex items-center justify-between disabled:cursor-default"
          >
            <span className="text-2xl font-extrabold tabular-nums tracking-tight text-ink">
              {formatMmSs(timeLeft)}
            </span>
            {!isComplete && (
              <span className="text-[11px] font-semibold text-ink/45">▶ 탭해서 보기</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
