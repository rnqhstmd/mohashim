import { useState } from "react";
import { discardSession } from "../../lib/timer";
import { Potato } from "../Potato";
import { SpeechBubble } from "../SpeechBubble";
import type { PotatoState } from "../../lib/phrases";
import { DiscardModal } from "./DiscardModal";

type PomodoroCardProps = {
  phase: "focus" | "break" | "complete";
  timeLeft: number;
  potatoState: PotatoState;
  phrase: string;
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
 * PomodoroRunning과 동일한 discardSession + DiscardModal 패턴을 카드 형태로 차용.
 * 카드 영역 ~120px 높이로 압축하여 todos 본체 공간 확보 (옵션 A 통합, M1).
 */
export function PomodoroCard({
  phase,
  timeLeft,
  potatoState,
  phrase,
}: PomodoroCardProps) {
  const [showDiscard, setShowDiscard] = useState(false);

  const handleConfirm = async () => {
    try {
      await discardSession();
      setShowDiscard(false);
    } catch {
      // discardSession 실패 시 모달 유지 — 사용자가 재시도 가능
    }
  };

  // phase는 ModeChip(우상단)이 표시하므로 본 컴포넌트에는 헤딩 미사용.
  void phase;

  return (
    <div className="border-b border-deep/10 bg-cream px-3 py-2">
      <div className="flex items-center gap-3">
        <Potato state={potatoState} size={80} animated={true} />
        <div className="flex flex-1 flex-col gap-1">
          <SpeechBubble text={phrase} />
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold tabular-nums text-deep">
              {formatMmSs(timeLeft)}
            </span>
            <button
              type="button"
              onClick={() => setShowDiscard(true)}
              className="text-xs text-deep/60 underline"
            >
              그만하기
            </button>
          </div>
        </div>
      </div>
      <DiscardModal
        open={showDiscard}
        onConfirm={() => {
          void handleConfirm();
        }}
        onCancel={() => setShowDiscard(false)}
      />
    </div>
  );
}
