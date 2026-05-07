import { useState } from "react";
import { discardSession } from "../../lib/timer";
import { Potato } from "../Potato";
import { SpeechBubble } from "../SpeechBubble";
import type { PotatoState } from "../../lib/phrases";
import { DiscardModal } from "./DiscardModal";

type TimerDetailScreenProps = {
  timeLeft: number;
  potatoState: PotatoState;
  phrase: string;
  onBack: () => void;
};

function formatMmSs(secs: number): string {
  const safe = Math.max(0, Math.floor(secs));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Todos 탭 내 타이머 상세 화면 — PomodoroCard 클릭 시 노출 (Phase 17 B2-F, FR-F3~F5).
 *
 * 좌상단 ← 뒤로가기 / 중앙 Potato + SpeechBubble + 대형 MM:SS / 하단 [그만하기].
 * DiscardModal 인스턴스를 직접 보유하며 discardSession()을 호출 (PomodoroCard 기존 패턴 차용).
 *
 * BR-5: focus/break에서만 진입. complete/idle 진입은 호출자(TodosTab)의 phase effect로 차단.
 * 본 컴포넌트는 phase에 의존하지 않으므로 prop을 받지 않는다 (PR phase-review HIGH 반영).
 */
export function TimerDetailScreen({
  timeLeft,
  potatoState,
  phrase,
  onBack,
}: TimerDetailScreenProps) {
  const [showDiscard, setShowDiscard] = useState(false);

  const handleConfirm = async () => {
    try {
      await discardSession();
      setShowDiscard(false);
    } catch {
      // discardSession 실패 시 모달 유지 — 사용자가 재시도 가능
    }
  };

  return (
    <div className="flex h-full flex-col bg-cream">
      <div className="flex items-center px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로가기"
          className="text-2xl text-deep"
        >
          ←
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
        <Potato state={potatoState} size={120} animated={true} />
        <SpeechBubble text={phrase} />
        <span className="text-6xl font-bold tabular-nums text-deep">
          {formatMmSs(timeLeft)}
        </span>
      </div>

      <div className="flex justify-center px-3 py-4">
        <button
          type="button"
          onClick={() => setShowDiscard(true)}
          className="text-sm text-deep/60 underline"
        >
          그만하기
        </button>
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
